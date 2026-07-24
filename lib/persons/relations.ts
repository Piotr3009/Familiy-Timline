import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database, Relationship, VisiblePerson} from '@/lib/database.types';

/**
 * In-memory family graph. Families are small (tens of people), so the
 * profile page and tree load all visible persons + relationships in two
 * queries and derive structure here. RLS filters what the viewer sees.
 */
export type FamilyGraph = {
  persons: Map<string, VisiblePerson>;
  relationships: Relationship[];
};

export async function loadFamilyGraph(
  supabase: SupabaseClient<Database>,
  familyId: string
): Promise<FamilyGraph> {
  const [{data: persons}, {data: relationships}] = await Promise.all([
    supabase.from('visible_persons').select('*').eq('family_id', familyId),
    supabase.from('relationships').select('*').eq('family_id', familyId)
  ]);
  return {
    persons: new Map((persons ?? []).map((person) => [person.id, person])),
    relationships: relationships ?? []
  };
}

export function personName(person: VisiblePerson): string {
  return `${person.first_name} ${person.last_name}`;
}

export function parentsOf(graph: FamilyGraph, personId: string): VisiblePerson[] {
  return graph.relationships
    .filter((rel) => rel.type === 'parent_child' && rel.person_b_id === personId)
    .map((rel) => graph.persons.get(rel.person_a_id))
    .filter((person): person is VisiblePerson => Boolean(person));
}

export function childrenOf(graph: FamilyGraph, personId: string): VisiblePerson[] {
  return graph.relationships
    .filter((rel) => rel.type === 'parent_child' && rel.person_a_id === personId)
    .map((rel) => graph.persons.get(rel.person_b_id))
    .filter((person): person is VisiblePerson => Boolean(person));
}

export type PartnerLink = {person: VisiblePerson; relationship: Relationship};

/** Current partner statuses get solid lines; ended ones dashed. */
export const CURRENT_PARTNER_STATUSES = ['partners', 'married', 'widowed'] as const;

export function partnersOf(graph: FamilyGraph, personId: string): PartnerLink[] {
  const links: PartnerLink[] = [];
  for (const rel of graph.relationships) {
    if (rel.type !== 'partner') continue;
    const otherId =
      rel.person_a_id === personId
        ? rel.person_b_id
        : rel.person_b_id === personId
          ? rel.person_a_id
          : null;
    if (!otherId) continue;
    const person = graph.persons.get(otherId);
    if (person) links.push({person, relationship: rel});
  }
  return links;
}

/** Explicit sibling records + siblings derived from a shared parent. */
export function siblingsOf(graph: FamilyGraph, personId: string): VisiblePerson[] {
  const ids = new Set<string>();
  for (const rel of graph.relationships) {
    if (rel.type !== 'sibling') continue;
    if (rel.person_a_id === personId) ids.add(rel.person_b_id);
    if (rel.person_b_id === personId) ids.add(rel.person_a_id);
  }
  const myParents = parentsOf(graph, personId).map((parent) => parent.id);
  for (const parentId of myParents) {
    for (const child of childrenOf(graph, parentId)) {
      if (child.id !== personId) ids.add(child.id);
    }
  }
  return [...ids]
    .map((id) => graph.persons.get(id))
    .filter((person): person is VisiblePerson => Boolean(person));
}

export function sortByBirth(persons: VisiblePerson[]): VisiblePerson[] {
  return [...persons].sort((a, b) => {
    const keyA = (a.birth_year ?? 9999) * 10000 + (a.birth_month ?? 0) * 100 + (a.birth_day ?? 0);
    const keyB = (b.birth_year ?? 9999) * 10000 + (b.birth_month ?? 0) * 100 + (b.birth_day ?? 0);
    return keyA - keyB;
  });
}
