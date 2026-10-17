/**
 * Verified router and protocol addresses copied strictly from official protocol documentation.
 * Used for informational risk classification ("Known Protocol").
 */

export interface KnownRouter {
  name: string;
  protocol: string;
  address: string;
  docsUrl: string;
}

export const KNOWN_ROUTERS: Record<string, KnownRouter> = {
  // Uniswap Universal Router (Mainnet & Sepolia)
  // Source: https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': {
    name: 'Universal Router',
    protocol: 'Uniswap',
    address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    docsUrl: 'https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments',
  },

  // Uniswap Permit2 Canonical Contract (Mainnet & Sepolia)
  // Source: https://docs.uniswap.org/contracts/permit2/overview
  '0x000000000022d473030f116ddee9f6b43ac78ba3': {
    name: 'Permit2 Canonical',
    protocol: 'Uniswap',
    address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    docsUrl: 'https://docs.uniswap.org/contracts/permit2/overview',
  },

  // Uniswap SwapRouter02 (Mainnet & Sepolia)
  // Source: https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': {
    name: 'SwapRouter02',
    protocol: 'Uniswap',
    address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    docsUrl: 'https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments',
  },

  // Uniswap V2 Router02 (Mainnet & Sepolia)
  // Source: https://docs.uniswap.org/contracts/v2/reference/smart-contracts/router-02
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': {
    name: 'V2 Router02',
    protocol: 'Uniswap',
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    docsUrl: 'https://docs.uniswap.org/contracts/v2/reference/smart-contracts/router-02',
  },

  // 1inch Aggregation Router v5 (Mainnet)
  // Source: https://docs.1inch.io/docs/aggregation-protocol/smart-contract/
  '0x1111111254eeb25477b68fb85ed929f73a960582': {
    name: 'Aggregation Router v5',
    protocol: '1inch',
    address: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    docsUrl: 'https://docs.1inch.io/docs/aggregation-protocol/smart-contract/',
  },

  // 1inch Aggregation Router v6 (Mainnet)
  // Source: https://docs.1inch.io/docs/aggregation-protocol/smart-contract/
  '0x111111125421ca6dc452d289314280a0f8842a65': {
    name: 'Aggregation Router v6',
    protocol: '1inch',
    address: '0x111111125421cA6dc452d289314280a0f8842A65',
    docsUrl: 'https://docs.1inch.io/docs/aggregation-protocol/smart-contract/',
  },
};

/**
 * Returns router details if the spender is a known verified protocol contract, or undefined otherwise.
 */
export function getKnownRouter(spenderAddress: string): KnownRouter | undefined {
  return KNOWN_ROUTERS[spenderAddress.toLowerCase()];
}
