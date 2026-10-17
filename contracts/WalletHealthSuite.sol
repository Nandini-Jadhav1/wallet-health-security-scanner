// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ============================================================================
 * Wallet Health Check - All-in-One Deployment File for Remix
 * ============================================================================
 * 
 * Contracts included:
 *   1. DemoToken    (ERC-20 token with a 1,000 DEMO faucet)
 *   2. DemoSpender  (Simulated dApp/DEX that pulls tokens via user approvals)
 *   3. HealthBadge  (On-chain registry to record wallet health audit badges)
 * ============================================================================
 */

// ── ERC20 Interface ──────────────────────────────────────────────────────────

interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

// ── Standalone OpenZeppelin-compatible ERC20 Base ────────────────────────────

abstract contract ERC20Base is IERC20, IERC20Metadata {
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;
    string private _name;
    string private _symbol;

    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);
    error ERC20InvalidSender(address sender);
    error ERC20InvalidReceiver(address receiver);
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);
    error ERC20InvalidApprover(address approver);
    error ERC20InvalidSpender(address spender);

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 value) public virtual override returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 value) public virtual override returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public virtual override returns (bool) {
        _spendAllowance(from, msg.sender, value);
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        if (to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        uint256 fromBalance = _balances[from];
        if (fromBalance < value) {
            revert ERC20InsufficientBalance(from, fromBalance, value);
        }
        unchecked {
            _balances[from] = fromBalance - value;
            _balances[to] += value;
        }

        emit Transfer(from, to, value);
    }

    function _mint(address account, uint256 value) internal virtual {
        if (account == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _totalSupply += value;
        unchecked {
            _balances[account] += value;
        }
        emit Transfer(address(0), account, value);
    }

    function _approve(address owner, address spender, uint256 value) internal virtual {
        _approve(owner, spender, value, true);
    }

    function _approve(address owner, address spender, uint256 value, bool emitEvent) internal virtual {
        if (owner == address(0)) {
            revert ERC20InvalidApprover(address(0));
        }
        if (spender == address(0)) {
            revert ERC20InvalidSpender(address(0));
        }
        _allowances[owner][spender] = value;
        if (emitEvent) {
            emit Approval(owner, spender, value);
        }
    }

    function _spendAllowance(address owner, address spender, uint256 value) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < value) {
                revert ERC20InsufficientAllowance(spender, currentAllowance, value);
            }
            unchecked {
                _approve(owner, spender, currentAllowance - value, false);
            }
        }
    }
}

// ── Contract 1: DemoToken ───────────────────────────────────────────────────

/**
 * @title DemoToken
 * @dev An ERC-20 token created specifically for the Wallet Health Check Demo Lab on Sepolia.
 *      Allows users to test approval scanning and revoking in a safe test environment.
 *      Features a public faucet with a per-address cooldown to prevent abuse.
 */
contract DemoToken is ERC20Base {
    /// @notice Minimum cooldown between faucet claims for a given address (1 minute)
    uint256 public constant FAUCET_COOLDOWN = 1 minutes;

    /// @notice Amount of tokens distributed per faucet call (1,000 DEMO)
    uint256 public constant FAUCET_AMOUNT = 1000 * 10 ** 18;

    /// @notice Maps user addresses to the timestamp of their last faucet claim
    mapping(address => uint256) public lastFaucetClaim;

    /// @notice Thrown when a user attempts to call faucet before the cooldown has elapsed
    /// @param availableAt The unix timestamp when the user can claim tokens again
    error FaucetCooldownActive(uint256 availableAt);

    /// @notice Emitted when a user successfully claims tokens from the faucet
    /// @param recipient The address receiving the minted tokens
    /// @param amount The quantity of tokens minted
    event FaucetClaimed(address indexed recipient, uint256 amount);

    /**
     * @notice Initializes DemoToken with name "Demo Token" and symbol "DEMO"
     */
    constructor() ERC20Base("Demo Token", "DEMO") {}

    /**
     * @notice Public faucet allowing any user to mint 1,000 DEMO tokens for testing.
     *         Enforces a 1-minute cooldown per caller to prevent spam.
     */
    function faucet() external {
        uint256 nextEligibleTime = lastFaucetClaim[msg.sender] + FAUCET_COOLDOWN;
        if (block.timestamp < nextEligibleTime) {
            revert FaucetCooldownActive(nextEligibleTime);
        }

        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }
}

// ── Contract 2: DemoSpender ─────────────────────────────────────────────────

/**
 * @title DemoSpender
 * @dev Simulates a third-party dApp (DEX, Lending protocol, NFT marketplace) in the Demo Lab.
 *      Demonstrates the core vulnerability of token approvals:
 *      Once a user grants an allowance (especially "Unlimited"), this contract can unilaterally
 *      call `transferFrom` at any future time to drain tokens from the user's wallet without
 *      prompting another signature. Revoking the allowance to 0 immediately renders `pull` impossible.
 */
contract DemoSpender {
    /// @notice Custom error thrown when the token contract address is zero
    error InvalidTokenAddress();

    /// @notice Custom error thrown when the source owner address is zero
    error InvalidSourceAddress();

    /// @notice Custom error thrown when trying to pull zero tokens
    error InvalidAmount();

    /// @notice Custom error thrown if the underlying transferFrom call fails or returns false
    error TransferFailed();

    /// @notice Emitted whenever the spender pulls tokens from an approved user
    /// @param token The address of the ERC-20 token pulled
    /// @param from The wallet address whose tokens were transferred
    /// @param to The recipient address (this contract)
    /// @param amount The quantity of tokens pulled
    event Pulled(address indexed token, address indexed from, address indexed to, uint256 amount);

    /**
     * @notice Pulls approved tokens from a target wallet into this contract.
     * @dev Demonstrates why unlimited approvals are risky: if a spender is malicious,
     *      compromised, or contains a logic bug, it can withdraw tokens up to the approved allowance.
     * @param token Address of the ERC-20 token to pull
     * @param from Address of the user wallet that approved this contract
     * @param amount Number of token units to pull
     */
    function pull(address token, address from, uint256 amount) external {
        if (token == address(0)) revert InvalidTokenAddress();
        if (from == address(0)) revert InvalidSourceAddress();
        if (amount == 0) revert InvalidAmount();

        // Execute transferFrom utilizing the active allowance
        bool success = IERC20(token).transferFrom(from, address(this), amount);
        if (!success) revert TransferFailed();

        emit Pulled(token, from, address(this), amount);
    }

    /**
     * @notice Allows this contract to receive tokens or query its balance
     * @param token The ERC-20 token to query
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}

// ── Contract 3: HealthBadge ─────────────────────────────────────────────────

/**
 * @title HealthBadge
 * @notice Provides verifiable, on-chain recording of a wallet's approval health check audit.
 * @dev Users can permanently checkpoint their security health status on-chain.
 */
contract HealthBadge {
    /// @notice Struct holding the audit results for a specific wallet check
    struct CheckRecord {
        uint16 activeApprovals;
        uint16 highRisk;
        uint256 timestamp;
        bool exists;
    }

    /// @notice Mapping from user wallet address to their most recent health audit record
    mapping(address => CheckRecord) private _records;

    /// @notice Emitted whenever a user saves their health report on-chain
    /// @param user The address of the wallet audited
    /// @param activeApprovals Total number of active ERC-20 approvals detected
    /// @param highRisk Number of approvals categorized as High Risk (e.g. unlimited allowances)
    /// @param timestamp Unix timestamp when the audit was recorded
    event HealthChecked(
        address indexed user,
        uint16 activeApprovals,
        uint16 highRisk,
        uint256 timestamp
    );

    /**
     * @notice Records the latest health check results for the caller's address.
     * @param activeApprovals Total active approvals found during the scan
     * @param highRisk Count of high-risk / unlimited approvals
     */
    function recordCheck(uint16 activeApprovals, uint16 highRisk) external {
        _records[msg.sender] = CheckRecord({
            activeApprovals: activeApprovals,
            highRisk: highRisk,
            timestamp: block.timestamp,
            exists: true
        });

        emit HealthChecked(msg.sender, activeApprovals, highRisk, block.timestamp);
    }

    /**
     * @notice Retrieves the most recent health check record for a given user.
     * @param user The wallet address to query
     * @return activeApprovals Total active approvals recorded
     * @return highRisk High-risk approvals recorded
     * @return timestamp Unix timestamp of the recorded audit
     * @return exists True if a check has been recorded for this wallet, false otherwise
     */
    function getLatestCheck(address user)
        external
        view
        returns (
            uint16 activeApprovals,
            uint16 highRisk,
            uint256 timestamp,
            bool exists
        )
    {
        CheckRecord memory rec = _records[user];
        return (rec.activeApprovals, rec.highRisk, rec.timestamp, rec.exists);
    }
}
