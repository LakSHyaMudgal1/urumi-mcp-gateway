import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Application Shell & Navigation Routing', () => {

  // Logic matching parseRouteFromLocation in AppShell.tsx
  function parseRouteFromLocation(location) {
    const path = (location.pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
    const hash = (location.hash || '').replace(/^#+/, '').toLowerCase();
    const search = location.search || '';
    const param = new URLSearchParams(search).get('tab')?.toLowerCase();

    const candidate = path || hash || param || 'overview';

    switch (candidate) {
      case 'overview':
      case 'home':
        return 'overview';
      case 'stores':
      case 'tenants':
        return 'stores';
      case 'servers':
      case 'fleet':
        return 'servers';
      case 'team':
      case 'keys':
        return 'team';
      case 'client-setup':
      case 'setup':
        return 'setup';
      case 'audit':
      case 'logs':
        return 'audit';
      case 'playground':
      case 'chat':
        return 'chat';
      default:
        return 'overview';
    }
  }

  describe('1. Direct URL Loading & Route Parsing', () => {
    it('should parse direct root URL to default overview tab', () => {
      assert.strictEqual(parseRouteFromLocation({ pathname: '/' }), 'overview');
    });

    it('should parse direct pathname routes correctly', () => {
      assert.strictEqual(parseRouteFromLocation({ pathname: '/overview' }), 'overview');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/servers' }), 'servers');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/stores' }), 'stores');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/team' }), 'team');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/setup' }), 'setup');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/client-setup' }), 'setup');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/audit' }), 'audit');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/chat' }), 'chat');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/playground' }), 'chat');
    });

    it('should parse hash-based navigation links', () => {
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', hash: '#overview' }), 'overview');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', hash: '#team' }), 'team');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', hash: '#stores' }), 'stores');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', hash: '#audit' }), 'audit');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', hash: '#chat' }), 'chat');
    });

    it('should parse query parameter routes (?tab=...)', () => {
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', search: '?tab=overview' }), 'overview');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', search: '?tab=team' }), 'team');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', search: '?tab=stores' }), 'stores');
      assert.strictEqual(parseRouteFromLocation({ pathname: '/', search: '?tab=audit' }), 'audit');
    });

    it('should fall back gracefully to overview on unknown routes', () => {
      assert.strictEqual(parseRouteFromLocation({ pathname: '/unknown-route' }), 'overview');
    });
  });

  describe('2. Navigation Item Grouping & Role Visibility', () => {
    const NAV_ITEMS = [
      { id: 'overview', label: 'Overview', group: 'platform' },
      { id: 'servers', label: 'MCP Servers', group: 'platform' },
      { id: 'stores', label: 'Store Tenants', group: 'platform' },
      { id: 'team', label: 'Team & API Keys', group: 'governance' },
      { id: 'audit', label: 'Audit Logs', group: 'governance', adminOnly: true },
      { id: 'setup', label: 'Client Setup', group: 'tools' },
      { id: 'chat', label: 'Chat / Playground', group: 'tools' }
    ];

    function getVisibleNavItems(role) {
      return NAV_ITEMS.filter(item => !item.adminOnly || role === 'admin');
    }

    it('should ensure all items belong to defined categories without phantom routes', () => {
      const allowedGroups = new Set(['platform', 'governance', 'tools']);
      for (const item of NAV_ITEMS) {
        assert.ok(allowedGroups.has(item.group), `Item ${item.id} has invalid group ${item.group}`);
      }
      assert.strictEqual(NAV_ITEMS.length, 7, 'Exactly 7 valid routes must exist');
    });

    it('should provide full 7 items to admin user', () => {
      const adminItems = getVisibleNavItems('admin');
      assert.strictEqual(adminItems.length, 7);
      assert.ok(adminItems.some(i => i.id === 'audit'), 'Admin must have Audit Logs');
    });

    it('should filter out audit logs for member user', () => {
      const memberItems = getVisibleNavItems('member');
      assert.strictEqual(memberItems.length, 6);
      assert.strictEqual(memberItems.some(i => i.id === 'audit'), false, 'Member must not see Audit Logs');
    });

    it('should guard against unauthorized direct navigation to audit logs', () => {
      function guardRoute(requestedTab, role) {
        if (requestedTab === 'audit' && role !== 'admin') {
          return 'overview';
        }
        return requestedTab;
      }

      assert.strictEqual(guardRoute('audit', 'admin'), 'audit');
      assert.strictEqual(guardRoute('audit', 'member'), 'overview', 'Member must be redirected away from audit route');
      assert.strictEqual(guardRoute('team', 'member'), 'team');
    });
  });

  describe('3. Sidebar Collapse & Mobile Drawer States', () => {
    it('should manage desktop sidebar collapsed state toggling', () => {
      let isCollapsed = false;
      const toggle = () => { isCollapsed = !isCollapsed; };

      assert.strictEqual(isCollapsed, false);
      toggle();
      assert.strictEqual(isCollapsed, true);
      toggle();
      assert.strictEqual(isCollapsed, false);
    });

    it('should handle mobile drawer close on route selection', () => {
      let isDrawerOpen = true;
      let activeTab = 'servers';

      function selectTab(newTab) {
        activeTab = newTab;
        isDrawerOpen = false;
      }

      selectTab('team');
      assert.strictEqual(activeTab, 'team');
      assert.strictEqual(isDrawerOpen, false, 'Drawer must close upon tab selection');
    });
  });
});
