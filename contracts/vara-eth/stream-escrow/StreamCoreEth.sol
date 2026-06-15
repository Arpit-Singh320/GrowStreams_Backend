// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IStreamCoreEth {
    event DepositRecorded(uint64 id, uint128 amount, uint128 newDeposited);

    event StreamCreated(uint64 id, uint8[32] sender, uint8[32] receiver, uint128 flowRate, uint128 deposit);

    event StreamLiquidated(uint64 id);

    event StreamPaused(uint64 id);

    event StreamResumed(uint64 id);

    event StreamStopped(uint64 id, uint128 unstreamed);

    event StreamUpdated(uint64 id, uint128 newFlowRate);

    event WithdrawRecorded(uint64 id, uint128 amount);

    function initialize(bool _callReply, uint8[32] calldata admin, uint64 minBufferSeconds) external returns (bytes32 messageId);

    function streamServiceActiveStreams(bool _callReply) external returns (bytes32 messageId);

    function streamServiceCreateStream(bool _callReply, uint8[32] calldata caller, uint8[32] calldata sender, uint8[32] calldata receiver, uint128 flowRate, uint128 initialDeposit, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceGetDeposited(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceGetFlowRate(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceGetReceiver(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceGetReceiverStreams(bool _callReply, uint8[32] calldata receiver) external returns (bytes32 messageId);

    function streamServiceGetSender(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceGetSenderStreams(bool _callReply, uint8[32] calldata sender) external returns (bytes32 messageId);

    function streamServiceGetStatus(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceGetStreamed(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceGetWithdrawn(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceLiquidate(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServicePauseStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceRecordDeposit(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint128 amount) external returns (bytes32 messageId);

    function streamServiceRecordWithdraw(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint128 amount, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceRemainingBuffer(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceResumeStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceStopStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceStreamExists(bool _callReply, uint64 streamId) external returns (bytes32 messageId);

    function streamServiceTotalStreams(bool _callReply) external returns (bytes32 messageId);

    function streamServiceUpdateStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint128 newFlowRate, uint64 nowSecs) external returns (bytes32 messageId);

    function streamServiceWithdrawableBalance(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId);
}

contract StreamCoreEthAbi is IStreamCoreEth {
    function initialize(bool _callReply, uint8[32] calldata admin, uint64 minBufferSeconds) external returns (bytes32 messageId) {}

    function streamServiceActiveStreams(bool _callReply) external returns (bytes32 messageId) {}

    function streamServiceCreateStream(bool _callReply, uint8[32] calldata caller, uint8[32] calldata sender, uint8[32] calldata receiver, uint128 flowRate, uint128 initialDeposit, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceGetDeposited(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceGetFlowRate(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceGetReceiver(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceGetReceiverStreams(bool _callReply, uint8[32] calldata receiver) external returns (bytes32 messageId) {}

    function streamServiceGetSender(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceGetSenderStreams(bool _callReply, uint8[32] calldata sender) external returns (bytes32 messageId) {}

    function streamServiceGetStatus(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceGetStreamed(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceGetWithdrawn(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceLiquidate(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServicePauseStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceRecordDeposit(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint128 amount) external returns (bytes32 messageId) {}

    function streamServiceRecordWithdraw(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint128 amount, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceRemainingBuffer(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceResumeStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceStopStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceStreamExists(bool _callReply, uint64 streamId) external returns (bytes32 messageId) {}

    function streamServiceTotalStreams(bool _callReply) external returns (bytes32 messageId) {}

    function streamServiceUpdateStream(bool _callReply, uint8[32] calldata caller, uint64 streamId, uint128 newFlowRate, uint64 nowSecs) external returns (bytes32 messageId) {}

    function streamServiceWithdrawableBalance(bool _callReply, uint64 streamId, uint64 nowSecs) external returns (bytes32 messageId) {}
}

interface IStreamCoreEthCallbacks {
    function replyOn_initialize(bytes32 messageId) external;

    function replyOn_streamServiceActiveStreams(bytes32 messageId, uint64 reply) external;

    function replyOn_streamServiceCreateStream(bytes32 messageId, uint64 reply) external;

    function replyOn_streamServiceGetDeposited(bytes32 messageId, uint128 reply) external;

    function replyOn_streamServiceGetFlowRate(bytes32 messageId, uint128 reply) external;

    function replyOn_streamServiceGetReceiver(bytes32 messageId, uint8[32] calldata reply) external;

    function replyOn_streamServiceGetReceiverStreams(bytes32 messageId, uint64[] calldata reply) external;

    function replyOn_streamServiceGetSender(bytes32 messageId, uint8[32] calldata reply) external;

    function replyOn_streamServiceGetSenderStreams(bytes32 messageId, uint64[] calldata reply) external;

    function replyOn_streamServiceGetStatus(bytes32 messageId, uint64 reply) external;

    function replyOn_streamServiceGetStreamed(bytes32 messageId, uint128 reply) external;

    function replyOn_streamServiceGetWithdrawn(bytes32 messageId, uint128 reply) external;

    function replyOn_streamServiceLiquidate(bytes32 messageId) external;

    function replyOn_streamServicePauseStream(bytes32 messageId) external;

    function replyOn_streamServiceRecordDeposit(bytes32 messageId) external;

    function replyOn_streamServiceRecordWithdraw(bytes32 messageId) external;

    function replyOn_streamServiceRemainingBuffer(bytes32 messageId, uint128 reply) external;

    function replyOn_streamServiceResumeStream(bytes32 messageId) external;

    function replyOn_streamServiceStopStream(bytes32 messageId, uint128 reply) external;

    function replyOn_streamServiceStreamExists(bytes32 messageId, bool reply) external;

    function replyOn_streamServiceTotalStreams(bytes32 messageId, uint64 reply) external;

    function replyOn_streamServiceUpdateStream(bytes32 messageId) external;

    function replyOn_streamServiceWithdrawableBalance(bytes32 messageId, uint128 reply) external;

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable;
}

contract StreamCoreEthCaller is IStreamCoreEthCallbacks {
    IStreamCoreEth public immutable VARA_ETH_PROGRAM;

    error UnauthorizedCaller();

    constructor(IStreamCoreEth _varaEthProgram) {
        VARA_ETH_PROGRAM = _varaEthProgram;
    }

    modifier onlyVaraEthProgram() {
        _onlyVaraEthProgram();
        _;
    }

    function _onlyVaraEthProgram() internal view {
        if (msg.sender != address(VARA_ETH_PROGRAM)) {
            revert UnauthorizedCaller();
        }
    }

    function replyOn_initialize(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceActiveStreams(bytes32 messageId, uint64 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceCreateStream(bytes32 messageId, uint64 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetDeposited(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetFlowRate(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetReceiver(bytes32 messageId, uint8[32] calldata reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetReceiverStreams(bytes32 messageId, uint64[] calldata reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetSender(bytes32 messageId, uint8[32] calldata reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetSenderStreams(bytes32 messageId, uint64[] calldata reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetStatus(bytes32 messageId, uint64 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetStreamed(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceGetWithdrawn(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceLiquidate(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServicePauseStream(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceRecordDeposit(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceRecordWithdraw(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceRemainingBuffer(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceResumeStream(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceStopStream(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceStreamExists(bytes32 messageId, bool reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceTotalStreams(bytes32 messageId, uint64 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceUpdateStream(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_streamServiceWithdrawableBalance(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable onlyVaraEthProgram {
        // TODO: implement this
    }
}
