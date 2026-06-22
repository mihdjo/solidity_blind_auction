import { expect } from "chai";
import { network } from "hardhat";

describe("BlindAuction", function () {
  async function deployBlindAuctionFixture() {
    const connection = await network.getOrCreate();
    const { ethers, networkHelpers } = connection;

    const [owner, alice, bob] = await ethers.getSigners();

    const biddingTime = 60;
    const revealTime = 60;

    const auction = await ethers.deployContract("BlindAuction", [
      biddingTime,
      revealTime,
      owner.address,
    ]);

    function makeBlindedBid(value: bigint, fake: boolean, secret: string) {
      return ethers.solidityPackedKeccak256(
        ["uint256", "bool", "bytes32"],
        [value, fake, secret]
      );
    }

    return {
      ethers,
      networkHelpers,
      auction,
      owner,
      alice,
      bob,
      biddingTime,
      revealTime,
      makeBlindedBid,
    };
  }

  it("should deploy with correct beneficiary", async function () {
    const { auction, owner } = await deployBlindAuctionFixture();

    expect(await auction.beneficiary()).to.equal(owner.address);
  });

  it("should accept blinded bids during bidding phase", async function () {
    const { ethers, auction, alice, makeBlindedBid } =
      await deployBlindAuctionFixture();

    const secret = ethers.encodeBytes32String("secret1");
    const value = 10n;

    const blindedBid = makeBlindedBid(value, false, secret);

    await auction.connect(alice).bid(blindedBid, {
      value,
    });

    const bid = await auction.bids(alice.address, 0);

    expect(bid.blindedBid).to.equal(blindedBid);
    expect(bid.deposit).to.equal(value);
  });

  it("should reveal bids and set highest bidder", async function () {
    const {
      ethers,
      networkHelpers,
      auction,
      alice,
      bob,
      makeBlindedBid,
    } = await deployBlindAuctionFixture();

    const aliceSecret = ethers.encodeBytes32String("alice");
    const bobSecret = ethers.encodeBytes32String("bob");

    const aliceValue = 10n;
    const bobValue = 20n;

    const aliceBlindedBid = makeBlindedBid(aliceValue, false, aliceSecret);
    const bobBlindedBid = makeBlindedBid(bobValue, false, bobSecret);

    await auction.connect(alice).bid(aliceBlindedBid, {
      value: aliceValue,
    });

    await auction.connect(bob).bid(bobBlindedBid, {
      value: bobValue,
    });

    await networkHelpers.time.increase(61);

    await auction
      .connect(alice)
      .reveal([aliceValue], [false], [aliceSecret]);

    await auction
      .connect(bob)
      .reveal([bobValue], [false], [bobSecret]);

    expect(await auction.highestBidder()).to.equal(bob.address);
    expect(await auction.highestBid()).to.equal(bobValue);
  });

  it("should ignore fake bids during reveal", async function () {
    const {
      ethers,
      networkHelpers,
      auction,
      alice,
      bob,
      makeBlindedBid,
    } = await deployBlindAuctionFixture();

    const aliceSecret = ethers.encodeBytes32String("alice");
    const bobSecret = ethers.encodeBytes32String("bob");

    const aliceValue = 10n;
    const bobValue = 100n;

    const aliceBlindedBid = makeBlindedBid(aliceValue, false, aliceSecret);
    const bobFakeBlindedBid = makeBlindedBid(bobValue, true, bobSecret);

    await auction.connect(alice).bid(aliceBlindedBid, {
      value: aliceValue,
    });

    await auction.connect(bob).bid(bobFakeBlindedBid, {
      value: bobValue,
    });

    await networkHelpers.time.increase(61);

    await auction
      .connect(alice)
      .reveal([aliceValue], [false], [aliceSecret]);

    await auction
      .connect(bob)
      .reveal([bobValue], [true], [bobSecret]);

    expect(await auction.highestBidder()).to.equal(alice.address);
    expect(await auction.highestBid()).to.equal(aliceValue);
  });

  it("should allow previous highest bidder to withdraw after being outbid", async function () {
    const {
      ethers,
      networkHelpers,
      auction,
      alice,
      bob,
      makeBlindedBid,
    } = await deployBlindAuctionFixture();

    const aliceSecret = ethers.encodeBytes32String("alice");
    const bobSecret = ethers.encodeBytes32String("bob");

    const aliceValue = 10n;
    const bobValue = 20n;

    await auction.connect(alice).bid(makeBlindedBid(aliceValue, false, aliceSecret), {
      value: aliceValue,
    });

    await auction.connect(bob).bid(makeBlindedBid(bobValue, false, bobSecret), {
      value: bobValue,
    });

    await networkHelpers.time.increase(61);

    await auction.connect(alice).reveal([aliceValue], [false], [aliceSecret]);
    await auction.connect(bob).reveal([bobValue], [false], [bobSecret]);

    expect(await auction.pendingReturns(alice.address)).to.equal(aliceValue);

    await auction.connect(alice).withdraw();

    expect(await auction.pendingReturns(alice.address)).to.equal(0n);
  });

  it("should end auction after reveal phase", async function () {
    const {
      ethers,
      networkHelpers,
      auction,
      owner,
      alice,
      makeBlindedBid,
    } = await deployBlindAuctionFixture();

    const secret = ethers.encodeBytes32String("alice");
    const value = 10n;

    await auction.connect(alice).bid(makeBlindedBid(value, false, secret), {
      value,
    });

    await networkHelpers.time.increase(61);

    await auction.connect(alice).reveal([value], [false], [secret]);

    await networkHelpers.time.increase(61);

    await expect(auction.connect(owner).auctionEnd())
      .to.emit(auction, "AuctionEnded")
      .withArgs(alice.address, value);

    expect(await auction.ended()).to.equal(true);
  });
});