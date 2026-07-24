import {describe, expect, it} from 'vitest';
import {computeTreeLayout, CARD_H} from '@/lib/tree';
import type {FamilyGraph} from '@/lib/persons/relations';
import type {Relationship, VisiblePerson} from '@/lib/database.types';

function person(id: string, firstName: string, birthYear: number | null): VisiblePerson {
  return {
    id,
    family_id: 'f1',
    user_id: null,
    managed_by: 'u1',
    created_by: 'u1',
    first_name: firstName,
    last_name: 'Test',
    maiden_name: null,
    gender: null,
    birth_year: birthYear,
    birth_month: null,
    birth_day: null,
    birth_place: null,
    death_year: null,
    death_month: null,
    death_day: null,
    death_place: null,
    is_deceased: false,
    avatar_url: null,
    bio: null,
    life_details_privacy: 'family',
    created_at: '',
    updated_at: '',
    details_visible: true
  };
}

function rel(
  id: string,
  a: string,
  b: string,
  type: Relationship['type'],
  status: Relationship['status'] = null
): Relationship {
  return {
    id,
    family_id: 'f1',
    person_a_id: a,
    person_b_id: b,
    type,
    parent_role: type === 'parent_child' ? 'biological' : null,
    status,
    start_date: null,
    wedding_date: null,
    separation_date: null,
    divorce_date: null,
    created_by: 'u1',
    created_at: '',
    updated_at: ''
  };
}

/** Three-generation fixture: grandparents -> parents(+sibling) -> child. */
function buildGraph(): FamilyGraph {
  const persons = [
    person('gp1', 'Grandpa', 1948),
    person('gp2', 'Grandma', 1950),
    person('dad', 'Dad', 1975),
    person('mom', 'Mom', 1978),
    person('aunt', 'Aunt', 1980),
    person('kid', 'Kid', 2005)
  ];
  const relationships = [
    rel('r1', 'gp1', 'gp2', 'partner', 'married'),
    rel('r2', 'gp1', 'dad', 'parent_child'),
    rel('r3', 'gp2', 'dad', 'parent_child'),
    rel('r4', 'gp1', 'aunt', 'parent_child'),
    rel('r5', 'gp2', 'aunt', 'parent_child'),
    rel('r6', 'dad', 'mom', 'partner', 'married'),
    rel('r7', 'dad', 'kid', 'parent_child'),
    rel('r8', 'mom', 'kid', 'parent_child')
  ];
  return {persons: new Map(persons.map((p) => [p.id, p])), relationships};
}

describe('computeTreeLayout', () => {
  it('returns null for an unknown focus', () => {
    expect(computeTreeLayout(buildGraph(), 'nobody')).toBeNull();
  });

  it('places 4 generations in distinct rows around the focus', () => {
    const layout = computeTreeLayout(buildGraph(), 'dad')!;
    const rowOf = (id: string) =>
      layout.nodes.find((node) => node.person.id === id)!.y;
    expect(rowOf('gp1')).toBe(rowOf('gp2'));
    expect(rowOf('gp1')).toBeLessThan(rowOf('dad'));
    expect(rowOf('dad')).toBe(rowOf('mom'));
    expect(rowOf('dad')).toBe(rowOf('aunt')); // sibling shares the focus row
    expect(rowOf('kid')).toBeGreaterThan(rowOf('dad'));
    expect(layout.nodes.find((node) => node.person.id === 'dad')!.isFocus).toBe(true);
  });

  it('includes every expected relative and no duplicates', () => {
    const layout = computeTreeLayout(buildGraph(), 'dad')!;
    const ids = layout.nodes.map((node) => node.person.id).sort();
    expect(ids).toEqual(['aunt', 'dad', 'gp1', 'gp2', 'kid', 'mom']);
  });

  it('derives siblings from shared parents without explicit records', () => {
    const layout = computeTreeLayout(buildGraph(), 'dad')!;
    expect(layout.nodes.some((node) => node.person.id === 'aunt')).toBe(true);
  });

  it('renders a solid partner edge for current partners and dashed for ended', () => {
    const graph = buildGraph();
    graph.relationships.push(rel('r9', 'dad', 'ex', 'partner', 'divorced'));
    graph.persons.set('ex', person('ex', 'Ex', 1976));
    const layout = computeTreeLayout(graph, 'dad')!;
    const partnerEdges = layout.edges.filter((edge) => edge.points.length === 2);
    expect(partnerEdges.some((edge) => !edge.dashed)).toBe(true);
    expect(partnerEdges.some((edge) => edge.dashed)).toBe(true);
  });

  it('keeps all cards inside the reported canvas', () => {
    const layout = computeTreeLayout(buildGraph(), 'kid')!;
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + 128).toBeLessThanOrEqual(layout.width);
      expect(node.y + CARD_H).toBeLessThanOrEqual(layout.height);
    }
  });

  it('does not overlap grandparent groups when both sides have parents', () => {
    const graph = buildGraph();
    graph.persons.set('gp3', person('gp3', 'Opa', 1945));
    graph.persons.set('gp4', person('gp4', 'Oma', 1952));
    graph.relationships.push(
      rel('r10', 'gp3', 'mom', 'parent_child'),
      rel('r11', 'gp4', 'mom', 'parent_child')
    );
    // Focus on the kid so both dad's and mom's parents land in row 0…
    // …but grandparents only render for the focus's parents, so focus on
    // dad's child is wrong — grandparent rows anchor to the focus.
    const layout = computeTreeLayout(graph, 'kid')!;
    const rows = new Map<number, {x: number}[]>();
    for (const node of layout.nodes) {
      const list = rows.get(node.y) ?? [];
      list.push({x: node.x});
      rows.set(node.y, list);
    }
    for (const list of rows.values()) {
      const sorted = [...list].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.x).toBeGreaterThanOrEqual(sorted[i - 1]!.x + 128);
      }
    }
  });
});
