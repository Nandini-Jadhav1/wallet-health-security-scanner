const fs = require('fs');
const path = require('path');

const dtPath = path.resolve('artifacts/contracts/DemoToken.sol/DemoToken.json');
const dsPath = path.resolve('artifacts/contracts/DemoSpender.sol/DemoSpender.json');
const hbPath = path.resolve('artifacts/contracts/HealthBadge.sol/HealthBadge.json');

const dt = JSON.parse(fs.readFileSync(dtPath, 'utf8')).abi;
const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8')).abi;
const hb = JSON.parse(fs.readFileSync(hbPath, 'utf8')).abi;

const content = `/**
 * Exported ABIs for DemoToken, DemoSpender, and HealthBadge contracts.
 * Generated automatically from compiled Hardhat artifacts.
 */

export const DEMO_TOKEN_ABI = ${JSON.stringify(dt, null, 2)} as const;

export const DEMO_SPENDER_ABI = ${JSON.stringify(ds, null, 2)} as const;

export const HEALTH_BADGE_ABI = ${JSON.stringify(hb, null, 2)} as const;
`;

fs.mkdirSync('src/contracts', { recursive: true });
fs.writeFileSync('src/contracts/abis.ts', content, 'utf8');
console.log('Successfully generated src/contracts/abis.ts');
