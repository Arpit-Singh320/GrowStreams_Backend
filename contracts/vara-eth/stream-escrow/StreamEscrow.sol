// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StreamEscrow
 * @notice Solidity side of the GrowStreams Vara.eth integration.
 *
 * Architecture (from vara-eth-solidity-integrator skill):
 *   - This contract holds ERC-20 tokens (USDC) in escrow.
 *   - The Vara.eth stream-core-eth program stores stream state (flow rate, accounting).
 *   - Every state-changing Vara.eth call is async: store messageId → context,
 *     only finalise local state from trusted callbacks.
 *
 * Flow:
 *   1. User calls deposit() → ERC-20 transferred to this contract.
 *   2. deposit() calls streamCoreAbi.StreamServiceCreateStream(callReply=true, ...).
 *   3. Vara.eth replies via replyOn_StreamServiceCreateStream(messageId, streamId).
 *   4. Callback activates the pending deposit and emits StreamCreated.
 *   5. Withdraw follows the same async pattern.
 *
 * Note: Callback names and ABI signatures follow the output of
 *   `cargo sails sol --idl-path stream-core-eth.idl`
 *   Verify generated names against your actual IDL output before deploying.
 *
 * skill: vara-eth-solidity-integrator
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @dev Interface generated from stream-core-eth IDL via `cargo sails sol`.
/// Names are camelCase (service prefix + method). Types use uint8[32] for [u8;32].
/// Verified against: contracts/vara-eth/StreamCoreEth.sol
interface IStreamCoreEth {
    function streamServiceCreateStream(
        bool _callReply,
        uint8[32] calldata caller,
        uint8[32] calldata sender,
        uint8[32] calldata receiver,
        uint128 flowRate,
        uint128 initialDeposit,
        uint64 nowSecs
    ) external returns (bytes32 messageId);

    function streamServiceRecordDeposit(
        bool _callReply,
        uint8[32] calldata caller,
        uint64 streamId,
        uint128 amount
    ) external returns (bytes32 messageId);

    function streamServiceRecordWithdraw(
        bool _callReply,
        uint8[32] calldata caller,
        uint64 streamId,
        uint128 amount,
        uint64 nowSecs
    ) external returns (bytes32 messageId);

    function streamServiceStopStream(
        bool _callReply,
        uint8[32] calldata caller,
        uint64 streamId,
        uint64 nowSecs
    ) external returns (bytes32 messageId);
}

contract StreamEscrow {

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    IERC20 public immutable token;
    IStreamCoreEth public immutable streamCoreAbi;

    address public admin;

    struct PendingCreate {
        address depositor;
        address receiver;
        uint128 amount;
        bool active;
    }

    struct PendingWithdraw {
        address recipient;
        uint64 streamId;
        uint128 amount;
        bool active;
    }

    struct PendingStop {
        address depositor;
        uint64 streamId;
        bool active;
    }

    // messageId → pending operation context (per skill: store enough context
    // to complete the operation after the async callback arrives)
    mapping(bytes32 => PendingCreate)   private pendingCreates;
    mapping(bytes32 => PendingCreate)   private pendingDeposits;
    mapping(bytes32 => PendingWithdraw) private pendingWithdraws;
    mapping(bytes32 => PendingStop)     private pendingStops;

    // streamId → depositor address for refund routing
    mapping(uint64 => address) public streamDepositor;
    // userAddress → claimable balance (from stopped streams / failed ops)
    mapping(address => uint256) public claimable;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event StreamPending(bytes32 indexed messageId, address indexed sender, address indexed receiver, uint128 amount);
    event StreamCreated(bytes32 indexed messageId, uint64 indexed streamId, address indexed sender);
    event DepositPending(bytes32 indexed messageId, uint64 indexed streamId, uint128 amount);
    event DepositConfirmed(bytes32 indexed messageId, uint64 indexed streamId);
    event WithdrawPending(bytes32 indexed messageId, uint64 indexed streamId, uint128 amount);
    event WithdrawConfirmed(bytes32 indexed messageId, address indexed recipient, uint128 amount);
    event StopPending(bytes32 indexed messageId, uint64 indexed streamId);
    event StopConfirmed(bytes32 indexed messageId, uint64 indexed streamId, uint128 unstreamed);
    event AsyncCallFailed(bytes32 indexed messageId, string reason);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address _token, address _streamCoreAbi) {
        token = IERC20(_token);
        streamCoreAbi = IStreamCoreEth(_streamCoreAbi);
        admin = msg.sender;
    }

    // -----------------------------------------------------------------------
    // User actions
    // -----------------------------------------------------------------------

    /**
     * @notice Deposit USDC and register a new stream in Vara.eth stream-core.
     * @param receiverBytes32  32-byte receiver ActorId on Vara.eth.
     * @param flowRate         Tokens per second (in token smallest units).
     * @param amount           Total deposit amount.
     */
    function deposit(
        bytes32 receiverBytes32,
        uint128 flowRate,
        uint128 amount
    ) external {
        require(amount > 0, "amount must be > 0");
        require(flowRate > 0, "flowRate must be > 0");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "ERC-20 transferFrom failed");

        // Pad 20-byte EVM address to bytes32 for Vara.eth ActorId
        bytes32 senderBytes32 = _addressToBytes32(msg.sender);
        uint8[32] memory senderArr = _bytes32ToArr(senderBytes32);
        uint8[32] memory receiverArr = _bytes32ToArr(receiverBytes32);

        // callReply=true — we want the async callback
        // Pass msg.sender as caller and block.timestamp as nowSecs
        bytes32 messageId = streamCoreAbi.streamServiceCreateStream(
            true,
            senderArr,
            senderArr,
            receiverArr,
            flowRate,
            amount,
            uint64(block.timestamp)
        );

        // Store pending context (skill rule: store enough to complete later)
        pendingCreates[messageId] = PendingCreate({
            depositor: msg.sender,
            receiver: _bytes32ToAddress(receiverBytes32),
            amount: amount,
            active: true
        });

        emit StreamPending(messageId, msg.sender, _bytes32ToAddress(receiverBytes32), amount);
    }

    /**
     * @notice Add more tokens to an existing stream.
     */
    function addDeposit(uint64 streamId, uint128 amount) external {
        require(amount > 0, "amount must be > 0");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "ERC-20 transferFrom failed");

        uint8[32] memory callerArr = _bytes32ToArr(_addressToBytes32(msg.sender));
        bytes32 messageId = streamCoreAbi.streamServiceRecordDeposit(
            true,
            callerArr,
            streamId,
            amount
        );

        pendingDeposits[messageId] = PendingCreate({
            depositor: msg.sender,
            receiver: address(0),
            amount: amount,
            active: true
        });

        emit DepositPending(messageId, streamId, amount);
    }

    /**
     * @notice Request a withdrawal from a stream. Tokens are released after
     *         the Vara.eth callback confirms the accrued balance.
     */
    function withdraw(uint64 streamId, uint128 amount) external {
        require(amount > 0, "amount must be > 0");

        uint8[32] memory callerArr = _bytes32ToArr(_addressToBytes32(msg.sender));
        bytes32 messageId = streamCoreAbi.streamServiceRecordWithdraw(
            true,
            callerArr,
            streamId,
            amount,
            uint64(block.timestamp)
        );

        pendingWithdraws[messageId] = PendingWithdraw({
            recipient: msg.sender,
            streamId: streamId,
            amount: amount,
            active: true
        });

        emit WithdrawPending(messageId, streamId, amount);
    }

    /**
     * @notice Stop a stream and reclaim unstreamed tokens.
     */
    function stopStream(uint64 streamId) external {
        uint8[32] memory callerArr = _bytes32ToArr(_addressToBytes32(msg.sender));
        bytes32 messageId = streamCoreAbi.streamServiceStopStream(
            true,
            callerArr,
            streamId,
            uint64(block.timestamp)
        );

        pendingStops[messageId] = PendingStop({
            depositor: msg.sender,
            streamId: streamId,
            active: true
        });

        emit StopPending(messageId, streamId);
    }

    /**
     * @notice Claim any refunded or returned tokens (pull pattern).
     */
    function claim() external {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "Nothing to claim");
        claimable[msg.sender] = 0;
        bool ok = token.transfer(msg.sender, amount);
        require(ok, "Transfer failed");
    }

    // -----------------------------------------------------------------------
    // Vara.eth ABI callbacks (skill rule: verify msg.sender == ABI address)
    // -----------------------------------------------------------------------

    modifier onlyStreamCore() {
        require(msg.sender == address(streamCoreAbi), "Callback: unauthorized sender");
        _;
    }

    // ---- value-return callbacks (generated names, camelCase) ----

    function replyOn_streamServiceCreateStream(
        bytes32 messageId,
        uint64 streamId
    ) external onlyStreamCore {
        PendingCreate storage op = pendingCreates[messageId];
        require(op.active, "Unknown or already handled messageId");
        op.active = false;

        // Record which depositor owns this streamId for stop/refund routing
        streamDepositor[streamId] = op.depositor;

        emit StreamCreated(messageId, streamId, op.depositor);
        delete pendingCreates[messageId];
    }

    function replyOn_streamServiceStopStream(
        bytes32 messageId,
        uint128 unstreamed
    ) external onlyStreamCore {
        PendingStop storage op = pendingStops[messageId];
        require(op.active, "Unknown or already handled messageId");
        op.active = false;

        address depositor = op.depositor;
        uint64 streamId = op.streamId;
        delete pendingStops[messageId];

        // Credit unstreamed balance for pull-style claim (skill rule: bounded transfers)
        if (unstreamed > 0) {
            claimable[depositor] += unstreamed;
        }

        emit StopConfirmed(messageId, streamId, unstreamed);
    }

    // ---- unit-return callbacks (generated names, camelCase) ----
    // Per skill error-log: unit-return methods may arrive as replyOn_...(bytes32,())
    // selector instead of replyOn_...(bytes32). Keep both for compatibility.

    function replyOn_streamServiceRecordDeposit(
        bytes32 messageId
    ) external onlyStreamCore {
        _finaliseDeposit(messageId);
    }

    function replyOn_streamServiceRecordWithdraw(
        bytes32 messageId
    ) external onlyStreamCore {
        _finaliseWithdraw(messageId);
    }

    // ---- unit-return fallbacks for (bytes32,()) selector variant ----
    // Mirror may call replyOn_...(bytes32,()) on unit-return methods.
    // We decode the messageId from calldata and dispatch to the same logic.

    fallback() external onlyStreamCore {
        // Must be at least 4 (selector) + 32 (messageId) bytes
        if (msg.data.length < 36) return;
        bytes4 sel = bytes4(msg.data[:4]);
        bytes32 messageId;
        assembly { messageId := calldataload(4) }

        if (sel == bytes4(keccak256("replyOn_streamServiceRecordDeposit(bytes32,())"))) {
            _finaliseDeposit(messageId);
        } else if (sel == bytes4(keccak256("replyOn_streamServiceRecordWithdraw(bytes32,())"))) {
            _finaliseWithdraw(messageId);
        }
    }

    function _finaliseDeposit(bytes32 messageId) internal {
        PendingCreate storage op = pendingDeposits[messageId];
        require(op.active, "Unknown or already handled messageId");
        op.active = false;
        emit DepositConfirmed(messageId, 0);
        delete pendingDeposits[messageId];
    }

    function _finaliseWithdraw(bytes32 messageId) internal {
        PendingWithdraw storage op = pendingWithdraws[messageId];
        require(op.active, "Unknown or already handled messageId");
        op.active = false;

        address recipient = op.recipient;
        uint128 amount = op.amount;
        delete pendingWithdraws[messageId];

        bool ok = token.transfer(recipient, amount);
        require(ok, "Token transfer failed");

        emit WithdrawConfirmed(messageId, recipient, amount);
    }

    /**
     * @notice Called by Vara.eth ABI interface on any message error.
     *         Per skill: mark operation failed, credit claimable for user to reclaim.
     *         Signature matches generated: onErrorReply(bytes32, bytes calldata, bytes4)
     */
    function onErrorReply(bytes32 messageId, bytes calldata /*payload*/, bytes4 /*replyCode*/) external onlyStreamCore {
        // Check stream creates (failed — refund escrowed tokens)
        PendingCreate storage pc = pendingCreates[messageId];
        if (pc.active) {
            pc.active = false;
            claimable[pc.depositor] += pc.amount;
            emit AsyncCallFailed(messageId, "create_stream");
            delete pendingCreates[messageId];
            return;
        }

        // Check add-deposits (failed — refund escrowed tokens)
        PendingCreate storage pd = pendingDeposits[messageId];
        if (pd.active) {
            pd.active = false;
            claimable[pd.depositor] += pd.amount;
            emit AsyncCallFailed(messageId, "record_deposit");
            delete pendingDeposits[messageId];
            return;
        }

        // Check withdraws (failed withdraw — no tokens moved, nothing to refund)
        PendingWithdraw storage pw = pendingWithdraws[messageId];
        if (pw.active) {
            pw.active = false;
            emit AsyncCallFailed(messageId, "record_withdraw");
            delete pendingWithdraws[messageId];
            return;
        }

        // Check stops
        PendingStop storage ps = pendingStops[messageId];
        if (ps.active) {
            ps.active = false;
            emit AsyncCallFailed(messageId, "stop_stream");
            delete pendingStops[messageId];
            return;
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function _addressToBytes32(address addr) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    function _bytes32ToAddress(bytes32 b) internal pure returns (address) {
        return address(uint160(uint256(b)));
    }

    /// @dev Convert bytes32 to uint8[32] as required by the generated ABI interface.
    function _bytes32ToArr(bytes32 b) internal pure returns (uint8[32] memory arr) {
        for (uint256 i = 0; i < 32; i++) {
            arr[i] = uint8(b[i]);
        }
    }
}
