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

    error TooLate(uint time);

    constructor(
        uint biddingTime,
        uint revealTime,
        address payable beneficiaryAddress
    ) {
        beneficiary = beneficiaryAddress;

        biddingEnd = block.timestamp + biddingTime;
        revealEnd = biddingEnd + revealTime;
    }

    modifier onlyBefore(uint time) {
        if (block.timestamp >= time)
            revert TooLate(time);
        _;
    }

    error TooEarly(uint time);

    modifier onlyAfter(uint time) {
        if (block.timestamp <= time)
            revert TooEarly(time);
        _;
    }   

    function bid(
        bytes32 blindedBid
    )
        external
        payable
        onlyBefore(biddingEnd)
    {
        bids[msg.sender].push(
            Bid({
                blindedBid: blindedBid,
                deposit: msg.value
            })
        );
    }

    error InvalidReveal();

    function reveal(
        uint[] calldata values,
        bool[] calldata fakes,
        bytes32[] calldata secrets
    )
        external
    {
        uint length = bids[msg.sender].length;
        if (values.length != length) revert InvalidReveal();
        if (fakes.length != length) revert InvalidReveal();
        if (secrets.length != length) revert InvalidReveal();

        uint refund;

        for (uint i = 0; i < length; i++) {
            Bid storage bidToCheck = bids[msg.sender][i];

            (uint value, bool fake, bytes32 secret) =
                (values[i], fakes[i], secrets[i]);

            bytes32 computedHash = keccak256(
                abi.encodePacked(value, fake, secret)
            );

            if (bidToCheck.blindedBid != computedHash) {
                // invalid bid → ignorisati
                continue;
            }

            refund += bidToCheck.deposit;

            if (!fake && bidToCheck.deposit >= value) {
                if (placeBid(msg.sender, value)) {
                    refund -= value;
                }
            }

            bidToCheck.blindedBid = bytes32(0);
        }

        payable(msg.sender).transfer(refund);
    }

    function placeBid(address bidder, uint value) internal returns (bool) {
    if (value <= highestBid) {
        return false;
    }

    if (highestBidder != address(0)) {
        pendingReturns[highestBidder] += highestBid;
    }

    highestBid = value;
    highestBidder = bidder;
    return true;
    }

    function withdraw() external returns (bool) {
        uint amount = pendingReturns[msg.sender];

        if (amount > 0) {
            pendingReturns[msg.sender] = 0;

            if (!payable(msg.sender).send(amount)) {
                pendingReturns[msg.sender] = amount;
                return false;
            }
        }

        return true;
    }

    function auctionEnd() external onlyAfter(revealEnd) {
        if (ended) return;

        ended = true;

        emit AuctionEnded(highestBidder, highestBid);

        beneficiary.transfer(highestBid);
    }
}