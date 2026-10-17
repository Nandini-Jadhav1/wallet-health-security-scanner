/**
 * Smart contract addresses for the Wallet Health Check app.
 *
 * Deploy DemoToken.sol, DemoSpender.sol, and HealthBadge.sol to Sepolia via Remix,
 * then paste the deployed contract addresses below.
 *
 * (Leave as placeholder or update with your deployed Sepolia addresses)
 */

export interface ContractAddresses {
  demoToken: string;
  demoSpender: string;
  healthBadge: string;
}

export const DEPLOYED_ADDRESSES: Record<number, ContractAddresses> = {
  // Sepolia Testnet (Chain ID: 11155111)
  11155111: {
    // Paste deployed address of DemoToken.sol here:
    demoToken: '0xE10b98C899Bf0da9BEfe78396FBB5c8301717D28',

    // Paste deployed address of DemoSpender.sol here:
    demoSpender: '0x664A73d54Fb02c7C4cEF8A9D4466590835f1a8c7',

    // Paste deployed address of HealthBadge.sol here:
    healthBadge: '0x7b96aF9Bd211cBf6BA5b0dd53aa61Dc5806b6AcE',
  },
  // Ethereum Mainnet (Chain ID: 1)
  1: {
    demoToken: '',
    demoSpender: '',
    healthBadge: '',
  },
};

/**
 * Returns deployed addresses for the active chain, or empty placeholders.
 */
export function getContractAddresses(chainId: number): ContractAddresses {
  return (
    DEPLOYED_ADDRESSES[chainId] || {
      demoToken: '',
      demoSpender: '',
      healthBadge: '',
    }
  );
}
