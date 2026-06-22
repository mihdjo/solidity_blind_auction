// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract BlindAuction {

    struct Bid {
        bytes32 blindedBid;
        uint deposit;
    }

    address payable public beneficiary;

    uint public biddingEnd;
    uint public revealEnd;

    bool public ended;

    address public highestBidder;
    uint public highestBid;

    mapping(address => uint) public pendingReturns;

    mapping(address => Bid[]) public bids;

    event AuctionEnded(
        address winner,
        uint highestBid
    );

    constructor(
        uint biddingTime,
        uint revealTime,
        address payable beneficiaryAddress
    ) {
        beneficiary = beneficiaryAddress;

        biddingEnd = block.timestamp + biddingTime;
        revealEnd = biddingEnd + revealTime;
    }
}