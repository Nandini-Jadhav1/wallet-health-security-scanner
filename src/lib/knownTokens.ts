/**
 * Verified list of popular ERC-20 tokens on Ethereum Mainnet.
 * All contract addresses copied directly from official protocol documentation or block explorers.
 */

export interface KnownToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  sourceUrl: string;
}

export const MAINNET_POPULAR_TOKENS: KnownToken[] = [
  // Circle USD Coin (USDC)
  // Source: https://developers.circle.com/stablecoins/docs/usdc-on-main-networks
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    sourceUrl: 'https://developers.circle.com/stablecoins/docs/usdc-on-main-networks',
  },

  // Tether USD (USDT)
  // Source: https://tether.to/en/supported-protocols
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    sourceUrl: 'https://tether.to/en/supported-protocols',
  },

  // MakerDAO Dai Stablecoin (DAI)
  // Source: https://docs.makerdao.com/smart-contract-modules/dai-module/dai-detailed-documentation
  {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    sourceUrl: 'https://docs.makerdao.com/smart-contract-modules/dai-module/dai-detailed-documentation',
  },

  // Wrapped Ether (WETH9)
  // Source: https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    sourceUrl: 'https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  },
];

/**
 * Returns popular token info by address if known.
 */
export function getKnownToken(address: string): KnownToken | undefined {
  return MAINNET_POPULAR_TOKENS.find(
    (t) => t.address.toLowerCase() === address.toLowerCase()
  );
}
