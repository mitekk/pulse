/**
 * CursorPageDto — generic cursor-paginated response envelope.
 * Matches the { items, cursor, hasMore } contract from api-contract.md.
 */
export class CursorPageDto<T> {
  items!: T[];
  cursor!: string | null;
  hasMore!: boolean;

  static of<T>(items: T[], cursor: string | null, hasMore: boolean): CursorPageDto<T> {
    const page = new CursorPageDto<T>();
    page.items = items;
    page.cursor = cursor;
    page.hasMore = hasMore;
    return page;
  }
}
