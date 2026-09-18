const fs = require('fs');
const files = [
  'frontend/src/app/sql-editor/page.tsx',
  'frontend/src/app/security/page.tsx',
  'frontend/src/app/pipelines/page.tsx',
  'frontend/src/app/jobs/page.tsx',
  'frontend/src/app/governance/page.tsx',
  'frontend/src/app/dashboard/page.tsx',
  'frontend/src/app/audit/page.tsx',
  'frontend/src/app/admin/page.tsx',
  'frontend/src/app/employee-home/page.tsx',
  'frontend/src/components/layout/Sidebar.tsx',
  'frontend/src/components/auth/AuthGuard.tsx'
];
files.forEach(f => {
  let text = fs.readFileSync(f, 'utf8');
  text = text.split('href="/"').join('href="/chat"');
  text = text.split("router.push('/')").join("router.push('/chat')");
  text = text.split("router.replace('/')").join("router.replace('/chat')");
  fs.writeFileSync(f, text);
});
