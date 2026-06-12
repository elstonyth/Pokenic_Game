const PAGE = 1000;

type PageOpts = {
  skip: number;
  take: number;
  order: Record<string, "ASC" | "DESC">;
};

/**
 * Exhausts a paged list call. The default `order: { id: "ASC" }` is the
 * correctness guarantee, not a nicety: Postgres gives no row order without
 * ORDER BY, so skip/take paging over an unordered list can duplicate or drop
 * rows across page boundaries. Call sites that override `order` must keep a
 * unique column (id) as the final tiebreaker for the same reason.
 */
export async function pageAll<T>(
  list: (opts: PageOpts) => Promise<T[]>,
  order: PageOpts["order"] = { id: "ASC" },
): Promise<T[]> {
  const all: T[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await list({ skip, take: PAGE, order });
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

export default pageAll;
