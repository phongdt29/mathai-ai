/**
 * MathAI UI Review - Playwright Crawler
 * Crawl all pages, take screenshots at desktop (1440) + mobile (375)
 * Login as each role and capture authenticated pages
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3444';
const API_URL = 'http://localhost:3001/api';
const SCREENSHOT_DIR = join(import.meta.dirname, 'screenshots');
const REPORT_DIR = join(import.meta.dirname, 'reports');

mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(REPORT_DIR, { recursive: true });

const DEMO_PASSWORD = 'MathAI@Demo123';

const ROLES = {
  student: { email: 'student@mathai.vn', redirect: '/dashboard' },
  teacher: { email: 'teacher@mathai.vn', redirect: '/teacher' },
  admin: { email: 'admin@mathai.vn', redirect: '/admin' },
  parent: { email: 'parent@mathai.vn', redirect: '/parent' },
};

// Public pages (no auth needed)
const PUBLIC_PAGES = [
  { path: '/', name: 'homepage' },
  { path: '/login', name: 'login' },
  { path: '/register', name: 'register' },
  { path: '/forgot-password', name: 'forgot-password' },
];

// Authenticated pages per role
const ROLE_PAGES = {
  student: [
    { path: '/dashboard', name: 'dashboard' },
    { path: '/dashboard/lessons', name: 'lessons' },
    { path: '/dashboard/solver', name: 'solver' },
    { path: '/dashboard/chat', name: 'chat' },
    { path: '/dashboard/progress', name: 'progress' },
    { path: '/dashboard/points', name: 'points' },
    { path: '/dashboard/assignments', name: 'assignments' },
    { path: '/dashboard/assessment', name: 'assessment' },
    { path: '/dashboard/curriculum', name: 'curriculum' },
    { path: '/dashboard/settings', name: 'settings' },
  ],
  teacher: [
    { path: '/teacher', name: 'teacher-dashboard' },
    { path: '/teacher/classes', name: 'teacher-classes' },
    { path: '/teacher/students', name: 'teacher-students' },
    { path: '/teacher/assignments', name: 'teacher-assignments' },
    { path: '/teacher/gradebook', name: 'teacher-gradebook' },
    { path: '/teacher/analytics', name: 'teacher-analytics' },
    { path: '/teacher/content-library', name: 'teacher-content-library' },
    { path: '/teacher/proposals', name: 'teacher-proposals' },
    { path: '/teacher/settings', name: 'teacher-settings' },
  ],
  admin: [
    { path: '/admin', name: 'admin-dashboard' },
    { path: '/admin/users', name: 'admin-users' },
    { path: '/admin/students', name: 'admin-students' },
    { path: '/admin/teachers', name: 'admin-teachers' },
    { path: '/admin/classes', name: 'admin-classes' },
    { path: '/admin/assignments', name: 'admin-assignments' },
    { path: '/admin/content', name: 'admin-content' },
    { path: '/admin/content-library', name: 'admin-content-library' },
    { path: '/admin/reports', name: 'admin-reports' },
    { path: '/admin/activity', name: 'admin-activity' },
    { path: '/admin/ai-logs', name: 'admin-ai-logs' },
    { path: '/admin/proposals', name: 'admin-proposals' },
    { path: '/admin/settings', name: 'admin-settings' },
    { path: '/admin/tutors', name: 'admin-tutors' },
  ],
  parent: [
    { path: '/parent', name: 'parent-dashboard' },
    { path: '/parent/children', name: 'parent-children' },
    { path: '/parent/reports', name: 'parent-reports' },
    { path: '/parent/notifications', name: 'parent-notifications' },
    { path: '/parent/settings', name: 'parent-settings' },
  ],
};

const VIEWPORTS = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 375, height: 812, label: 'mobile' },
];

const issues = [];

function recordIssue(page, viewport, severity, category, description) {
  issues.push({ page, viewport, severity, category, description, timestamp: new Date().toISOString() });
}

async function loginViaAPI(role) {
  const { email } = ROLES[role];
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: DEMO_PASSWORD }),
    });
    const body = await res.json();
    if (body.success && body.data) {
      return body.data.tokens.access_token;
    }
    console.error(`Login failed for ${role}:`, body.message);
    return null;
  } catch (err) {
    console.error(`Login error for ${role}:`, err.message);
    return null;
  }
}

async function screenshotPage(page, pageName, viewport, context) {
  const filename = `${pageName}-${viewport.label}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);
  
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(500); // let layout settle
  
  // Wait for network idle or timeout
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    // continue even if network isn't fully idle
  }
  
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  📸 ${filename}`);
  return filepath;
}

async function checkPageIssues(page, pageName, viewport) {
  // Check for console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Check for visible error states
  const errorElements = await page.$$('[class*="error"], [class*="Error"], [role="alert"]');
  if (errorElements.length > 0) {
    for (const el of errorElements) {
      const text = await el.textContent();
      if (text && text.trim().length > 0 && !text.includes('Đăng nhập thất bại')) {
        recordIssue(pageName, viewport.label, 'warning', 'error-state', `Error element visible: "${text.trim().slice(0, 100)}"`);
      }
    }
  }

  // Check for broken images
  const images = await page.$$('img');
  for (const img of images) {
    const naturalWidth = await img.evaluate(el => el.naturalWidth);
    const src = await img.getAttribute('src');
    if (naturalWidth === 0 && src) {
      recordIssue(pageName, viewport.label, 'critical', 'broken-image', `Broken image: ${src}`);
    }
  }

  // Check for horizontal overflow (mobile)
  if (viewport.label === 'mobile') {
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasOverflow) {
      recordIssue(pageName, viewport.label, 'critical', 'overflow', 'Horizontal scroll detected on mobile');
    }
  }

  // Check for empty pages (no meaningful content)
  const bodyText = await page.evaluate(() => document.body.innerText.trim());
  if (bodyText.length < 10) {
    recordIssue(pageName, viewport.label, 'warning', 'empty-page', 'Page appears empty or has minimal content');
  }

  // Check for missing page title
  const title = await page.title();
  if (!title || title === '') {
    recordIssue(pageName, viewport.label, 'info', 'missing-title', 'Page has no title');
  }

  // Check touch targets on mobile
  if (viewport.label === 'mobile') {
    const smallButtons = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, [role="button"]');
      let count = 0;
      buttons.forEach(btn => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          count++;
        }
      });
      return count;
    });
    if (smallButtons > 3) {
      recordIssue(pageName, viewport.label, 'warning', 'touch-target', `${smallButtons} interactive elements smaller than 44x44px`);
    }
  }

  // Check color contrast (basic check for text on backgrounds)
  const lowContrastCount = await page.evaluate(() => {
    function getLuminance(r, g, b) {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function getContrastRatio(l1, l2) {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }
    function parseColor(color) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      return null;
    }

    let count = 0;
    const textElements = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, button, label, li');
    for (const el of Array.from(textElements).slice(0, 50)) {
      const style = window.getComputedStyle(el);
      const color = parseColor(style.color);
      const bgColor = parseColor(style.backgroundColor);
      if (color && bgColor && bgColor[0] + bgColor[1] + bgColor[2] > 0) {
        const textLum = getLuminance(...color);
        const bgLum = getLuminance(...bgColor);
        const ratio = getContrastRatio(textLum, bgLum);
        if (ratio < 4.5) count++;
      }
    }
    return count;
  });
  if (lowContrastCount > 2) {
    recordIssue(pageName, viewport.label, 'warning', 'contrast', `${lowContrastCount} elements may have low contrast ratio (<4.5:1)`);
  }

  // Check for focus-visible styles
  const hasFocusStyles = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule.selectorText && rule.selectorText.includes('focus-visible')) return true;
        }
      } catch { /* cross-origin */ }
    }
    return false;
  });
  if (!hasFocusStyles) {
    recordIssue(pageName, viewport.label, 'info', 'focus-visible', 'No :focus-visible styles detected');
  }
}

async function crawlPages(browser, pages, prefix, token) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.label === 'mobile' ? 2 : 1,
    });
    const page = await context.newPage();

    // Inject token if authenticated
    if (token) {
      await page.addInitScript((t) => {
        localStorage.setItem('token', t);
      }, token);
    }

    for (const p of pages) {
      const pageName = prefix ? `${prefix}-${p.name}` : p.name;
      const url = `${BASE_URL}${p.path}`;
      
      console.log(`  🌐 ${url} [${viewport.label}]`);
      
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        if (response && response.status() >= 400) {
          recordIssue(pageName, viewport.label, 'critical', 'http-error', `HTTP ${response.status()} on ${url}`);
        }

        await page.waitForTimeout(1000);
        await screenshotPage(page, pageName, viewport, context);
        await checkPageIssues(page, pageName, viewport);
      } catch (err) {
        recordIssue(pageName, viewport.label, 'critical', 'navigation-error', `Failed to load: ${err.message}`);
        console.error(`  ❌ Error on ${url}: ${err.message}`);
      }
    }

    await context.close();
  }
}

function generateReport() {
  const critical = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');
  const info = issues.filter(i => i.severity === 'info');

  let report = `# MathAI UI Review Report\n\n`;
  report += `**Date:** ${new Date().toISOString().slice(0, 10)}\n`;
  report += `**Tool:** Playwright + Chromium\n`;
  report += `**Viewports:** Desktop (1440x900), Mobile (375x812)\n\n`;
  report += `## Summary\n\n`;
  report += `| Severity | Count |\n|----------|-------|\n`;
  report += `| 🔴 Critical | ${critical.length} |\n`;
  report += `| 🟡 Warning | ${warnings.length} |\n`;
  report += `| 🔵 Info | ${info.length} |\n`;
  report += `| **Total** | **${issues.length}** |\n\n`;

  if (critical.length > 0) {
    report += `## 🔴 Critical Issues\n\n`;
    for (const issue of critical) {
      report += `- **[${issue.category}]** \`${issue.page}\` (${issue.viewport}): ${issue.description}\n`;
    }
    report += '\n';
  }

  if (warnings.length > 0) {
    report += `## 🟡 Warnings\n\n`;
    for (const issue of warnings) {
      report += `- **[${issue.category}]** \`${issue.page}\` (${issue.viewport}): ${issue.description}\n`;
    }
    report += '\n';
  }

  if (info.length > 0) {
    report += `## 🔵 Info\n\n`;
    for (const issue of info) {
      report += `- **[${issue.category}]** \`${issue.page}\` (${issue.viewport}): ${issue.description}\n`;
    }
    report += '\n';
  }

  report += `## Pages Reviewed\n\n`;
  report += `### Public Pages\n`;
  for (const p of PUBLIC_PAGES) {
    report += `- \`${p.path}\` → screenshots: \`${p.name}-desktop.png\`, \`${p.name}-mobile.png\`\n`;
  }
  for (const [role, pages] of Object.entries(ROLE_PAGES)) {
    report += `\n### ${role.charAt(0).toUpperCase() + role.slice(1)} Pages\n`;
    for (const p of pages) {
      report += `- \`${p.path}\` → screenshots: \`${role}-${p.name}-desktop.png\`, \`${role}-${p.name}-mobile.png\`\n`;
    }
  }

  report += `\n## Screenshots Directory\n\n`;
  report += `All screenshots saved to: \`scripts/ui-review/screenshots/\`\n`;

  const reportPath = join(REPORT_DIR, 'ui-review-report.md');
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📋 Report saved: ${reportPath}`);
  return reportPath;
}

async function main() {
  console.log('🚀 MathAI UI Review - Starting Playwright crawl...\n');

  const browser = await chromium.launch({ headless: true });

  // 1. Public pages
  console.log('📄 Crawling public pages...');
  await crawlPages(browser, PUBLIC_PAGES, '', null);

  // 2. Authenticated pages per role
  for (const [role, pages] of Object.entries(ROLE_PAGES)) {
    console.log(`\n🔐 Logging in as ${role}...`);
    const token = await loginViaAPI(role);
    if (!token) {
      recordIssue(`${role}-login`, 'all', 'critical', 'auth', `Cannot login as ${role}`);
      console.error(`  ❌ Skipping ${role} pages - login failed`);
      continue;
    }
    console.log(`  ✅ Logged in as ${role}`);
    console.log(`📄 Crawling ${role} pages...`);
    await crawlPages(browser, pages, role, token);
  }

  await browser.close();

  // Generate report
  console.log('\n📊 Generating report...');
  generateReport();

  console.log(`\n✅ UI Review complete! Found ${issues.length} issues.`);
  if (issues.filter(i => i.severity === 'critical').length > 0) {
    console.log(`⚠️  ${issues.filter(i => i.severity === 'critical').length} critical issues need attention.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
