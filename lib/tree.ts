import type {VisiblePerson} from '@/lib/database.types';
import {
  childrenOf,
  parentsOf,
  partnersOf,
  siblingsOf,
  sortByBirth,
  CURRENT_PARTNER_STATUSES,
  type FamilyGraph,
  type PartnerLink
} from '@/lib/persons/relations';

/**
 * Layout for the Stage 1 tree: up to 4 rows around a focus person —
 * grandparents, parents, focus row (siblings + focus + partners),
 * children. Pure math in "column units"; the renderer converts to px.
 */

export type TreeGenerations = 3 | 4 | 5;

export const CARD_W = 128;
export const CARD_H = 176;
export const GAP_X = 24;
export const GAP_Y = 64;

const COL = CARD_W + GAP_X;
const ROW = CARD_H + GAP_Y;

export type TreeNodeVariant = 'focus' | 'partner' | 'sibling' | 'relative';

export type TreeNode = {
  person: VisiblePerson;
  /** Pixel position of the card's top-left corner. */
  x: number;
  y: number;
  isFocus: boolean;
  /** Drives per-role card styling (siblings render muted). */
  variant: TreeNodeVariant;
};

export type TreeEdge = {
  /** Poly-line points in px. */
  points: Array<{x: number; y: number}>;
  dashed: boolean;
  /** Ending year of an ended partner relationship (shown on the line). */
  endYear?: number | null;
  /** Anchor for the endYear label, px. */
  labelAt?: {x: number; y: number};
};

export type TreePartnerFilter = 'all' | 'current';

export type TreeLayout = {
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
  /** Center of the focus card in px — the renderer scrolls this into view. */
  focusCenter: {x: number; y: number};
};

type Placed = {
  person: VisiblePerson;
  col: number;
  row: number;
  isFocus?: boolean;
  variant: TreeNodeVariant;
};

export function computeTreeLayout(
  graph: FamilyGraph,
  focusId: string,
  options: {partnerFilter?: TreePartnerFilter; generations?: TreeGenerations} = {}
): TreeLayout | null {
  const focus = graph.persons.get(focusId);
  if (!focus) return null;
  const partnerFilter = options.partnerFilter ?? 'all';
  const generations = options.generations ?? 4;

  const parents = sortByBirth(parentsOf(graph, focusId)).slice(0, 2);
  const siblings = sortByBirth(siblingsOf(graph, focusId));
  // A remarried pair has SEVERAL partner records (divorced + married):
  // render one card per PERSON, preferring their current record.
  const partnerLinksRaw = partnersOf(graph, focusId);
  const linkByPerson = new Map<string, PartnerLink>();
  for (const link of partnerLinksRaw) {
    const existing = linkByPerson.get(link.person.id);
    const linkIsCurrent = CURRENT_PARTNER_STATUSES.includes(
      link.relationship.status as (typeof CURRENT_PARTNER_STATUSES)[number]
    );
    const existingIsCurrent =
      existing !== undefined &&
      CURRENT_PARTNER_STATUSES.includes(
        existing.relationship.status as (typeof CURRENT_PARTNER_STATUSES)[number]
      );
    if (!existing || (linkIsCurrent && !existingIsCurrent)) {
      linkByPerson.set(link.person.id, link);
    }
  }
  const partnerLinks = [...linkByPerson.values()];
  const currentPartners = partnerLinks.filter((link) =>
    CURRENT_PARTNER_STATUSES.includes(
      link.relationship.status as (typeof CURRENT_PARTNER_STATUSES)[number]
    )
  );
  const endedPartners = partnerLinks.filter((link) => !currentPartners.includes(link));
  // 'current' hides ended relationships — the PEOPLE never disappear:
  // children of a hidden ex still render, connected to the focus.
  const orderedPartners =
    partnerFilter === 'current' ? currentPartners : [...currentPartners, ...endedPartners];
  const children = sortByBirth(childrenOf(graph, focusId));

  // Row 2 (focus row): OLDER siblings left, then the couple block
  // (focus + partners, kept adjacent so it reads as one unit), then
  // YOUNGER siblings right. Siblings with an unknown birth date sort
  // after known ones (see sortByBirth) and land on the younger side.
  const birthKey = (p: VisiblePerson) =>
    (p.birth_year ?? 9999) * 10000 + (p.birth_month ?? 0) * 100 + (p.birth_day ?? 0);
  const focusKey = birthKey(focus);
  const olderSiblings = siblings.filter((sibling) => birthKey(sibling) < focusKey);
  const youngerSiblings = siblings.filter((sibling) => birthKey(sibling) >= focusKey);

  const focusRow: Placed[] = [];
  olderSiblings.forEach((person, index) =>
    focusRow.push({person, col: index, row: 2, variant: 'sibling'})
  );
  const focusCol = olderSiblings.length;
  focusRow.push({person: focus, col: focusCol, row: 2, isFocus: true, variant: 'focus'});
  orderedPartners.forEach((link, index) =>
    focusRow.push({person: link.person, col: focusCol + 1 + index, row: 2, variant: 'partner'})
  );
  const youngerStart = focusCol + 1 + orderedPartners.length;
  youngerSiblings.forEach((person, index) =>
    focusRow.push({person, col: youngerStart + index, row: 2, variant: 'sibling'})
  );

  // Row 1: parents centered over the focus.
  const parentPlacements: Placed[] = [];
  if (parents.length === 1) {
    parentPlacements.push({person: parents[0]!, col: focusCol, row: 1, variant: 'relative'});
  } else if (parents.length === 2) {
    parentPlacements.push({person: parents[0]!, col: focusCol - 0.5, row: 1, variant: 'relative'});
    parentPlacements.push({person: parents[1]!, col: focusCol + 0.5, row: 1, variant: 'relative'});
  }

  // Row 0: each parent's parents, centered over that parent, then swept
  // left-to-right to remove overlaps.
  type GrandGroup = {parentId: string; members: Placed[]};
  const grandGroups: GrandGroup[] = [];
  // generations = 3 (parents + focus + children) hides the grandparent row.
  for (const placedParent of generations >= 4 ? parentPlacements : []) {
    const grandparents = sortByBirth(parentsOf(graph, placedParent.person.id)).slice(0, 2);
    if (grandparents.length === 0) continue;
    const members: Placed[] =
      grandparents.length === 1
        ? [{person: grandparents[0]!, col: placedParent.col, row: 0, variant: 'relative' as const}]
        : [
            {person: grandparents[0]!, col: placedParent.col - 0.5, row: 0, variant: 'relative' as const},
            {person: grandparents[1]!, col: placedParent.col + 0.5, row: 0, variant: 'relative' as const}
          ];
    grandGroups.push({parentId: placedParent.person.id, members});
  }
  for (let i = 1; i < grandGroups.length; i++) {
    const prev = grandGroups[i - 1]!;
    const current = grandGroups[i]!;
    const prevMax = Math.max(...prev.members.map((m) => m.col));
    const currentMin = Math.min(...current.members.map((m) => m.col));
    if (currentMin <= prevMax) {
      const shift = prevMax + 1 - currentMin;
      for (const member of current.members) member.col += shift;
    }
  }

  // Row 3: children grouped under the correct couple. Each child whose
  // OTHER parent is a displayed partner goes under that couple's
  // midpoint; children of hidden/unknown other parents sit under the
  // focus. Groups are swept left-to-right to remove overlaps.
  const partnerColByPersonId = new Map(
    orderedPartners.map((link, index) => [link.person.id, focusCol + 1 + index])
  );
  const soloChildren: VisiblePerson[] = [];
  const childrenByPartner = new Map<string, VisiblePerson[]>();
  for (const child of children) {
    const otherParent = parentsOf(graph, child.id).find(
      (parent) => parent.id !== focusId && partnerColByPersonId.has(parent.id)
    );
    if (otherParent) {
      const list = childrenByPartner.get(otherParent.id) ?? [];
      list.push(child);
      childrenByPartner.set(otherParent.id, list);
    } else {
      soloChildren.push(child);
    }
  }
  const childGroups: {centerCol: number; members: VisiblePerson[]}[] = [];
  if (soloChildren.length > 0) {
    childGroups.push({centerCol: focusCol, members: soloChildren});
  }
  for (const link of orderedPartners) {
    const members = childrenByPartner.get(link.person.id);
    if (!members || members.length === 0) continue;
    const partnerCol = partnerColByPersonId.get(link.person.id)!;
    childGroups.push({centerCol: (focusCol + partnerCol) / 2, members});
  }
  const childPlacements: Placed[] = [];
  let prevGroupMax = Number.NEGATIVE_INFINITY;
  for (const group of childGroups) {
    let startCol = group.centerCol - (group.members.length - 1) / 2;
    if (startCol <= prevGroupMax) startCol = prevGroupMax + 1;
    group.members.forEach((child, index) =>
      childPlacements.push({person: child, col: startCol + index, row: 3, variant: 'relative'})
    );
    prevGroupMax = startCol + group.members.length - 1;
  }

  // Row 4 (generations = 5): each child's own children, centered under
  // that child and swept left-to-right to remove overlaps.
  const grandchildPlacements: Placed[] = [];
  if (generations >= 5) {
    let prevMax = Number.NEGATIVE_INFINITY;
    for (const childPlaced of childPlacements) {
      const grandkids = sortByBirth(childrenOf(graph, childPlaced.person.id));
      if (grandkids.length === 0) continue;
      let startCol = childPlaced.col - (grandkids.length - 1) / 2;
      if (startCol <= prevMax) startCol = prevMax + 1;
      grandkids.forEach((grandkid, index) =>
        grandchildPlacements.push({
          person: grandkid,
          col: startCol + index,
          row: 4,
          variant: 'relative'
        })
      );
      prevMax = startCol + grandkids.length - 1;
    }
  }

  const all: Placed[] = [
    ...grandGroups.flatMap((group) => group.members),
    ...parentPlacements,
    ...focusRow,
    ...childPlacements,
    ...grandchildPlacements
  ];

  // Normalize columns to start at 0 and drop empty rows.
  const minCol = Math.min(...all.map((p) => p.col));
  const usedRows = [...new Set(all.map((p) => p.row))].sort((a, b) => a - b);
  const rowIndex = new Map(usedRows.map((row, index) => [row, index]));
  for (const placed of all) placed.col -= minCol;

  const nodes: TreeNode[] = all.map((placed) => ({
    person: placed.person,
    x: placed.col * COL,
    y: (rowIndex.get(placed.row) ?? 0) * ROW,
    isFocus: Boolean(placed.isFocus),
    variant: placed.variant
  }));
  const nodeById = new Map(nodes.map((node) => [node.person.id, node]));
  const centerOf = (node: TreeNode) => ({x: node.x + CARD_W / 2, y: node.y + CARD_H / 2});

  const edges: TreeEdge[] = [];

  // Partner edges: focus <-> each partner. Solid = current, dashed =
  // ended (with the end year, when known, shown at the line's middle).
  const focusNode = nodeById.get(focusId)!;
  orderedPartners.forEach((link, index) => {
    const partnerNode = nodeById.get(link.person.id);
    if (!partnerNode) return;
    const y = focusNode.y + CARD_H / 2 + index * 8;
    const from = focusNode.x < partnerNode.x ? focusNode : partnerNode;
    const to = focusNode.x < partnerNode.x ? partnerNode : focusNode;
    const dashed = !currentPartners.includes(link);
    const endDate = link.relationship.divorce_date ?? link.relationship.separation_date;
    const endYear = dashed && endDate ? Number(endDate.slice(0, 4)) : null;
    edges.push({
      dashed,
      endYear,
      labelAt: endYear
        ? {x: (from.x + CARD_W + to.x) / 2, y: y - 4}
        : undefined,
      points: [
        {x: from.x + CARD_W, y},
        {x: to.x, y}
      ]
    });
  });

  // Parent edges within displayed rows.
  const drawParentDrop = (
    parentNodes: TreeNode[],
    childNode: TreeNode
  ): void => {
    if (parentNodes.length === 0) return;
    const midX =
      parentNodes.reduce((sum, node) => sum + centerOf(node).x, 0) / parentNodes.length;
    const bottomY = parentNodes[0]!.y + CARD_H;
    const busY = bottomY + GAP_Y / 2;
    const childCenter = centerOf(childNode);
    edges.push({
      dashed: false,
      points: [
        {x: midX, y: bottomY},
        {x: midX, y: busY},
        {x: childCenter.x, y: busY},
        {x: childCenter.x, y: childNode.y}
      ]
    });
  };

  // Grandparents -> parents.
  for (const group of grandGroups) {
    const parentNode = nodeById.get(group.parentId);
    if (!parentNode) continue;
    drawParentDrop(
      group.members
        .map((member) => nodeById.get(member.person.id))
        .filter((node): node is TreeNode => Boolean(node)),
      parentNode
    );
  }

  // Parents -> focus and each displayed sibling that shares a parent.
  const parentNodes = parentPlacements
    .map((placed) => nodeById.get(placed.person.id))
    .filter((node): node is TreeNode => Boolean(node));
  if (parentNodes.length > 0) {
    const parentIds = new Set(parentPlacements.map((placed) => placed.person.id));
    drawParentDrop(parentNodes, focusNode);
    for (const sibling of siblings) {
      const siblingParents = parentsOf(graph, sibling.id);
      if (!siblingParents.some((parent) => parentIds.has(parent.id))) continue;
      const siblingNode = nodeById.get(sibling.id);
      if (siblingNode) drawParentDrop(parentNodes, siblingNode);
    }
  }

  // Focus (+ partner) -> children. Children connect to both displayed parents.
  for (const child of children) {
    const childNode = nodeById.get(child.id);
    if (!childNode) continue;
    const childParentNodes = parentsOf(graph, child.id)
      .map((parent) => nodeById.get(parent.id))
      .filter((node): node is TreeNode => Boolean(node))
      // Only parents sitting in the focus row form the drop anchor.
      .filter((node) => node.y === focusNode.y);
    drawParentDrop(childParentNodes.length > 0 ? childParentNodes : [focusNode], childNode);
  }

  // Children -> grandchildren (generations = 5).
  for (const grandchildPlaced of grandchildPlacements) {
    const grandchildNode = nodeById.get(grandchildPlaced.person.id);
    if (!grandchildNode) continue;
    const gcParentNodes = parentsOf(graph, grandchildPlaced.person.id)
      .map((parent) => nodeById.get(parent.id))
      .filter((node): node is TreeNode => Boolean(node))
      .filter((node) => node.y < grandchildNode.y);
    if (gcParentNodes.length > 0) drawParentDrop(gcParentNodes, grandchildNode);
  }

  const width = Math.max(...nodes.map((node) => node.x)) + CARD_W;
  const height = Math.max(...nodes.map((node) => node.y)) + CARD_H;
  const focusCenter = {x: focusNode.x + CARD_W / 2, y: focusNode.y + CARD_H / 2};
  return {nodes, edges, width, height, focusCenter};
}
