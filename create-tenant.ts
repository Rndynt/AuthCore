import { tenantService } from './src/application/tenant-service.js';

async function main() {
  try {
    console.log('Creating tenant kioskoincore...');
    const tenant = await tenantService.createTenant({
      id: 'kioskoincore',
      name: 'KioskoinCore',
      slug: 'kioskoincore'
    });
    console.log('✅ Tenant created successfully!');
    console.log(JSON.stringify(tenant, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
  process.exit(0);
}

main();
