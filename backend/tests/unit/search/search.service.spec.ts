import { describe, it, expect, vi } from 'vitest';
import { SearchService } from '../../../src/modules/search/search.service';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeSearchPortMock() {
  return {
    search: vi.fn().mockResolvedValue({ postIds: [], userIds: [], nextCursor: null }),
    suggest: vi.fn().mockResolvedValue({ userIds: [], tags: [] }),
  };
}

function makeVisibilityMock() {
  return {
    filterPostPage: vi.fn().mockImplementation((_, posts: unknown[]) => Promise.resolve(posts)),
    canViewPost: vi.fn().mockResolvedValue({ visible: true }),
  };
}

function makeTimelineMock() {
  return {
    getHashtagTimeline: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
  };
}

function makePostsMock() {
  return {
    findOne: vi.fn().mockResolvedValue({ post: { id: '1', text: 'hello' } }),
  };
}

function makeUsersMock() {
  return {
    getProfile: vi.fn().mockResolvedValue({
      user: {
        id: 'u1',
        handle: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        isVerified: false,
        isPrivate: false,
      },
    }),
  };
}

function makeDataSourceMock(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue(rows),
  };
}

function makeService(
  overrides: {
    searchPort?: ReturnType<typeof makeSearchPortMock>;
    timeline?: ReturnType<typeof makeTimelineMock>;
    posts?: ReturnType<typeof makePostsMock>;
    users?: ReturnType<typeof makeUsersMock>;
    dataSource?: ReturnType<typeof makeDataSourceMock>;
  } = {},
) {
  const searchPort = overrides.searchPort ?? makeSearchPortMock();
  const visibility = makeVisibilityMock();
  const timeline = overrides.timeline ?? makeTimelineMock();
  const posts = overrides.posts ?? makePostsMock();
  const users = overrides.users ?? makeUsersMock();
  const dataSource = overrides.dataSource ?? makeDataSourceMock();

  const service = new SearchService(
    searchPort as never,
    visibility as never,
    timeline as never,
    posts as never,
    users as never,
    dataSource as never,
  );

  return { service, searchPort, visibility, timeline, posts, users, dataSource };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchService', () => {
  describe('search — hashtag intent', () => {
    it('delegates #tag query to timelineService.getHashtagTimeline', async () => {
      const timeline = makeTimelineMock();
      timeline.getHashtagTimeline.mockResolvedValue({
        items: [{ id: '1' }],
        cursor: null,
        hasMore: false,
      });
      const { service } = makeService({ timeline });

      const result = await service.search({ q: '#typescript', viewerId: null });

      expect(timeline.getHashtagTimeline).toHaveBeenCalledWith('typescript', null, 20, undefined);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('search — user intent', () => {
    it('delegates @handle query to usersService.getProfile', async () => {
      const users = makeUsersMock();
      const { service } = makeService({ users });

      const result = await service.search({ q: '@alice', viewerId: 'me' });

      expect(users.getProfile).toHaveBeenCalledWith('alice', 'me');
      expect(result.items).toHaveLength(1);
      expect((result.items[0] as { handle: string }).handle).toBe('alice');
    });

    it('returns empty when user not found', async () => {
      const users = makeUsersMock();
      users.getProfile.mockRejectedValue(new Error('not found'));
      const { service } = makeService({ users });

      const result = await service.search({ q: '@unknown', viewerId: null });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('search — FTS', () => {
    it('calls searchPort.search with correct options for top type', async () => {
      const searchPort = makeSearchPortMock();
      searchPort.search.mockResolvedValue({ postIds: ['p1'], userIds: [], nextCursor: null });
      const posts = makePostsMock();
      posts.findOne.mockResolvedValue({ post: { id: 'p1', text: 'hello world' } });

      const { service } = makeService({ searchPort, posts });
      const result = await service.search({ q: 'hello world', type: 'top', viewerId: null });

      expect(searchPort.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'hello world', type: 'top' }),
      );
      expect(result.items).toHaveLength(1);
    });

    it('returns people as user cards for type=people', async () => {
      const searchPort = makeSearchPortMock();
      searchPort.search.mockResolvedValue({ postIds: [], userIds: ['u1'], nextCursor: null });

      const dataSource = makeDataSourceMock([
        {
          id: 'u1',
          handle: 'bob',
          display_name: 'Bob',
          avatar_media_id: null,
          is_verified: false,
          is_private: false,
        },
      ]);

      const { service } = makeService({ searchPort, dataSource });
      const result = await service.search({ q: 'bob', type: 'people', viewerId: null });

      expect(result.items).toHaveLength(1);
      const card = result.items[0] as { handle: string };
      expect(card.handle).toBe('bob');
    });

    it('returns empty list for empty query', async () => {
      const searchPort = makeSearchPortMock();
      searchPort.search.mockResolvedValue({ postIds: [], userIds: [], nextCursor: null });

      const { service } = makeService({ searchPort });
      const result = await service.search({ q: '', viewerId: null });

      expect(result.items).toHaveLength(0);
    });

    it('propagates cursor and hasMore from searchPort', async () => {
      const searchPort = makeSearchPortMock();
      searchPort.search.mockResolvedValue({
        postIds: ['p1', 'p2'],
        userIds: [],
        nextCursor: 'cursor-abc',
      });
      const posts = makePostsMock();
      posts.findOne.mockResolvedValue({ post: { id: 'p1', text: 'hi' } });

      const { service } = makeService({ searchPort, posts });
      const result = await service.search({ q: 'hello', type: 'latest', viewerId: null });

      expect(result.cursor).toBe('cursor-abc');
      expect(result.hasMore).toBe(true);
    });

    it('clamps limit to MAX_LIMIT (100)', async () => {
      const searchPort = makeSearchPortMock();
      const { service } = makeService({ searchPort });

      await service.search({ q: 'test', viewerId: null, limit: 9999 });

      expect(searchPort.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'test' }));
      // The limit passed to searchPort should be <= 100
      const callArgs = searchPort.search.mock.calls[0][0] as { query: string; limit?: number };
      expect((callArgs.limit ?? 0) <= 100).toBe(true);
    });
  });

  describe('suggest', () => {
    it('calls searchPort.suggest and returns users + tags', async () => {
      const searchPort = makeSearchPortMock();
      searchPort.suggest.mockResolvedValue({ userIds: ['u1'], tags: ['typescript'] });

      const dataSource = makeDataSourceMock([
        {
          id: 'u1',
          handle: 'alice',
          display_name: 'Alice',
          avatar_media_id: null,
          is_verified: false,
          is_private: false,
        },
      ]);

      // Second query call is for enrichTags
      let callCount = 0;
      dataSource.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            {
              id: 'u1',
              handle: 'alice',
              display_name: 'Alice',
              avatar_media_id: null,
              is_verified: false,
              is_private: false,
            },
          ]);
        }
        return Promise.resolve([{ tag: 'typescript', cnt: '42' }]);
      });

      const { service } = makeService({ searchPort, dataSource });
      const result = await service.suggest({ q: 'type', viewerId: null });

      expect(result.users).toHaveLength(1);
      expect(result.tags).toHaveLength(1);
      expect(result.tags[0].tag).toBe('typescript');
      expect(result.tags[0].postCount).toBe(42);
    });

    it('returns empty results for empty query', async () => {
      const searchPort = makeSearchPortMock();
      searchPort.suggest.mockResolvedValue({ userIds: [], tags: [] });

      const { service } = makeService({ searchPort });
      const result = await service.suggest({ q: '', viewerId: null });

      expect(result.users).toHaveLength(0);
      expect(result.tags).toHaveLength(0);
    });
  });
});
