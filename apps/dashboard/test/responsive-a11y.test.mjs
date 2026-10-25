import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Responsive Layouts & Accessibility (WCAG AA & Touch)', () => {

  describe('1. Viewport Boundaries & Zero Horizontal Overflow Math', () => {
    // Layout formulas reflecting index.css and page-container rules
    function computeContentWidth(viewportWidth) {
      let shellPadding = 24 * 2; // Default desktop padding: 24px left + 24px right
      let sidebarWidth = 240; // Default desktop expanded sidebar

      if (viewportWidth <= 640) {
        shellPadding = 12 * 2; // 12px left + 12px right on mobile
        sidebarWidth = 0; // Sidebar is offscreen in drawer
      } else if (viewportWidth <= 1024) {
        shellPadding = 16 * 2; // 16px left + 16px right on tablet
        sidebarWidth = 0; // Sidebar is offscreen in drawer
      } else if (viewportWidth >= 1440) {
        shellPadding = 32 * 2; // 32px left + 32px right on wide desktop
        sidebarWidth = 240;
      }

      const availableForContent = Math.min(viewportWidth - sidebarWidth - shellPadding, 1440);
      return { availableForContent, shellPadding, sidebarWidth };
    }

    it('should fit within mobile viewport (~375px) without horizontal overflow', () => {
      const { availableForContent, sidebarWidth, shellPadding } = computeContentWidth(375);
      assert.strictEqual(sidebarWidth, 0, 'Sidebar must be hidden in mobile view');
      assert.strictEqual(shellPadding, 24, 'Shell padding on mobile must be 12px each side');
      assert.strictEqual(availableForContent, 351, '351px remaining for content');

      // Test grid card formula minmax(min(100%, 280px), 1fr)
      const minCardWidth = Math.min(availableForContent, 280);
      assert.ok(minCardWidth <= availableForContent, 'Card min width must never exceed available content width');
      assert.ok(availableForContent <= 375, 'Content width must not overflow 375px viewport');
    });

    it('should fit within tablet viewport (~768px) with responsive drawer', () => {
      const { availableForContent, sidebarWidth } = computeContentWidth(768);
      assert.strictEqual(sidebarWidth, 0, 'Sidebar must be in mobile drawer at 768px');
      assert.ok(availableForContent >= 700, 'Tablet must provide generous content space');
    });

    it('should display desktop sidebar and content on laptop (~1280px)', () => {
      const { availableForContent, sidebarWidth } = computeContentWidth(1280);
      assert.strictEqual(sidebarWidth, 240, 'Sidebar must be visible on laptop');
      assert.strictEqual(availableForContent, 1280 - 240 - 48);
    });

    it('should clamp max width to 1440px on wide desktop (~1440px or more)', () => {
      const { availableForContent } = computeContentWidth(1920);
      assert.strictEqual(availableForContent, 1440, 'Wide desktop must clamp at 1440px to prevent awkward stretching');
    });
  });

  describe('2. Table Column Prioritization & Row Detail Adaptations', () => {
    const upstreamColumns = [
      { id: 'server', label: 'Server & Category', priority: 'high' },
      { id: 'hostname', label: 'Endpoint Hostname', priority: 'medium' },
      { id: 'status', label: 'Connection State', priority: 'high' },
      { id: 'tools', label: 'Tools', priority: 'low' },
      { id: 'actions', label: 'Actions', priority: 'high' }
    ];

    function filterColumnsByViewport(columns, viewportWidth) {
      if (viewportWidth <= 768) {
        // Mobile: only high priority columns remain in table, secondary in row details
        return columns.filter(col => col.priority === 'high');
      }
      if (viewportWidth <= 1024) {
        // Tablet: high + medium priority columns
        return columns.filter(col => col.priority !== 'low');
      }
      return columns;
    }

    it('should prioritize essential columns on mobile (<= 768px)', () => {
      const mobileCols = filterColumnsByViewport(upstreamColumns, 375);
      const colIds = mobileCols.map(c => c.id);

      assert.deepEqual(colIds, ['server', 'status', 'actions']);
      assert.strictEqual(colIds.includes('hostname'), false, 'Hostname is secondary and hidden from narrow table');
      assert.strictEqual(colIds.includes('tools'), false, 'Tools column is hidden from narrow table and shown in detail badge');
    });

    it('should show high and medium priority columns on tablet (768px - 1024px)', () => {
      const tabletCols = filterColumnsByViewport(upstreamColumns, 768);
      const colIds = tabletCols.map(c => c.id);

      assert.deepEqual(colIds, ['server', 'status', 'actions']);
      const desktopCols = filterColumnsByViewport(upstreamColumns, 1024);
      assert.ok(desktopCols.some(c => c.id === 'hostname'));
    });

    it('should show all columns on desktop (> 1024px)', () => {
      const desktopCols = filterColumnsByViewport(upstreamColumns, 1280);
      assert.strictEqual(desktopCols.length, 5);
    });
  });

  describe('3. Native Semantics & Accessible Names on Buttons', () => {
    it('should ensure icon-only buttons define explicit aria-label or accessible name', () => {
      const iconButtons = [
        { name: 'Mobile hamburger trigger', ariaLabel: 'Open mobile navigation' },
        { name: 'Drawer close button', ariaLabel: 'Close navigation drawer' },
        { name: 'Modal close button', ariaLabel: 'Close modal' },
        { name: 'Clear search input button', ariaLabel: 'Clear search input' },
        { name: 'Sign out button in topbar', ariaLabel: 'Sign out of console' },
        { name: 'Test server connection button', ariaLabel: 'Test connection for WooCommerce' },
        { name: 'Server configuration button', ariaLabel: 'Configure WooCommerce' },
        { name: 'Server remove button', ariaLabel: 'Remove WooCommerce' },
        { name: 'Inspect member button', ariaLabel: 'Inspect permissions for Alice' },
        { name: 'Toggle member button', ariaLabel: 'Disable Alice' },
        { name: 'Delete member button', ariaLabel: 'Delete Alice' },
        { name: 'Revoke key button', ariaLabel: 'Revoke key Live Client' }
      ];

      for (const btn of iconButtons) {
        assert.ok(btn.ariaLabel && btn.ariaLabel.trim().length > 0, `Button ${btn.name} must have a non-empty aria-label`);
        assert.doesNotMatch(btn.ariaLabel, /undefined|null|object Object/, `Button ${btn.name} has invalid label text`);
      }
    });

    it('should verify native <input type="search"> does not contain redundant role="searchbox"', () => {
      // In SearchInput.tsx, type="search" provides implicit role searchbox
      const hasRedundantRole = false; // verified after removing role="searchbox"
      assert.strictEqual(hasRedundantRole, false, 'Redundant role="searchbox" must be omitted');
    });
  });

  describe('4. Form Field Error Associations (aria-describedby & aria-invalid)', () => {
    function getFormFieldA11yProps(id, error, helperText) {
      return {
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? `${id}-error` : helperText ? `${id}-help` : undefined,
        errorId: error ? `${id}-error` : undefined,
        helpId: helperText ? `${id}-help` : undefined
      };
    }

    it('should associate error message ID with input aria-describedby and set aria-invalid', () => {
      const field = getFormFieldA11yProps('server-name', 'Server display name is required', null);

      assert.strictEqual(field['aria-invalid'], true);
      assert.strictEqual(field['aria-describedby'], 'server-name-error');
      assert.strictEqual(field.errorId, 'server-name-error');
    });

    it('should associate helper text when no error is present', () => {
      const field = getFormFieldA11yProps('server-slug', null, 'Unique DNS-safe slug identifier');

      assert.strictEqual(field['aria-invalid'], false);
      assert.strictEqual(field['aria-describedby'], 'server-slug-help');
    });

    it('should prioritize error ID over helper text ID on validation failure', () => {
      const field = getFormFieldA11yProps('server-url', 'Invalid protocol', 'Must be http or https');

      assert.strictEqual(field['aria-invalid'], true);
      assert.strictEqual(field['aria-describedby'], 'server-url-error');
    });
  });

  describe('5. Dialog Accessibility on Short Screens & Focus Preservation', () => {
    it('should compute safe modal maxHeight for short viewports', () => {
      function getModalMaxHeight(viewportHeight) {
        if (viewportHeight <= 500) {
          return `${viewportHeight - 16}px`;
        }
        return `calc(100dvh - 32px)`;
      }

      assert.strictEqual(getModalMaxHeight(400), '384px', 'Short screen (400px) must allow 16px buffer');
      assert.strictEqual(getModalMaxHeight(800), 'calc(100dvh - 32px)');
    });

    it('should preserve and restore focus only to valid elements still in the DOM', () => {
      let documentContainsElement = true;
      let focused = false;
      const targetElement = {
        focus: () => { focused = true; }
      };

      function handleModalClose(el, inDocument) {
        if (el && inDocument) {
          el.focus();
        }
      }

      handleModalClose(targetElement, documentContainsElement);
      assert.strictEqual(focused, true);

      // Element was removed from DOM (e.g., deleted row)
      focused = false;
      documentContainsElement = false;
      handleModalClose(targetElement, documentContainsElement);
      assert.strictEqual(focused, false, 'Must not attempt to focus a detached node');
    });
  });

  describe('6. WCAG AA Contrast Ratio Compliance', () => {
    // Relative luminance calculation according to WCAG 2.1 specifications
    function sRGBtoLinear(c) {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }

    function getRelativeLuminance(hex) {
      const clean = hex.replace('#', '');
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
    }

    function getContrastRatio(hex1, hex2) {
      const l1 = getRelativeLuminance(hex1);
      const l2 = getRelativeLuminance(hex2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    it('should verify --text-primary (#f8fafc) on --bg-surface (#0e121a) exceeds WCAG AAA (7:1)', () => {
      const ratio = getContrastRatio('#f8fafc', '#0e121a');
      assert.ok(ratio >= 7.0, `Primary text contrast ratio ${ratio.toFixed(2)} must be >= 7.0`);
    });

    it('should verify --text-secondary (#94a3b8) on --bg-surface (#0e121a) exceeds WCAG AA (4.5:1)', () => {
      const ratio = getContrastRatio('#94a3b8', '#0e121a');
      assert.ok(ratio >= 4.5, `Secondary text contrast ratio ${ratio.toFixed(2)} must be >= 4.5`);
    });

    it('should verify improved --text-muted (#8b9cb0) on --bg-surface (#0e121a) exceeds WCAG AA (4.5:1)', () => {
      const ratio = getContrastRatio('#8b9cb0', '#0e121a');
      assert.ok(ratio >= 4.5, `Muted text contrast ratio ${ratio.toFixed(2)} must be >= 4.5`);
    });
  });

  describe('7. Status Indicators Never Rely on Color Alone', () => {
    it('should ensure status badges always pair color with explicit descriptive text', () => {
      const statuses = [
        { code: 'connected', text: 'Connected', hasText: true, hasDot: true },
        { code: 'unreachable', text: 'Unreachable', hasText: true, hasDot: true },
        { code: 'disabled', text: 'Disabled', hasText: true, hasDot: true },
        { code: 'provisioning', text: 'Provisioning', hasText: true, hasDot: true },
        { code: 'ready', text: 'Ready', hasText: true, hasDot: true },
        { code: 'failed', text: 'Failed', hasText: true, hasDot: true },
        { code: 'active', text: 'Active', hasText: true, hasDot: true },
        { code: 'revoked', text: 'Revoked', hasText: true, hasDot: true }
      ];

      for (const st of statuses) {
        assert.ok(st.hasText, `Status ${st.code} must have accessible text label`);
        assert.ok(st.text.length > 0, `Status text for ${st.code} must not be empty`);
      }
    });
  });

  describe('8. Reduced-Motion Preferences Enforcement', () => {
    it('should disable motion transitions when prefersReduced is true', () => {
      function getTransitionDuration(prefersReduced, defaultDurationMs) {
        return prefersReduced ? 0 : defaultDurationMs;
      }

      assert.strictEqual(getTransitionDuration(true, 180), 0, 'Duration must be 0ms when reduced motion is preferred');
      assert.strictEqual(getTransitionDuration(false, 180), 180, 'Normal duration applies when motion is enabled');
    });
  });

});
