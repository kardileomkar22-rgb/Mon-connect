const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const E = ethers.parseEther;
const Status = { Created: 0, Funded: 1, InProgress: 2, Completed: 3, Released: 4, Refunded: 5 };

async function deploy() {
  const [deployer, feeWallet, organizer, vendor, stranger] = await ethers.getSigners();
  const C = await ethers.getContractFactory("ChainConnectV2");
  const c = await C.deploy(feeWallet.address);
  await c.connect(vendor).registerVendor("Acme Catering", "Food", "Ann", "a@x.io", "123", "GST1");
  return { c, deployer, feeWallet, organizer, vendor, stranger };
}

async function funded(f, { amount = E("10"), penalty = 10, days = 7 } = {}) {
  const dl = (await time.latest()) + days * 86400;
  const fee = (amount * 100n) / 10000n;
  await f.c.connect(f.organizer).createEscrowNative(f.vendor.address, amount, dl, penalty, { value: amount + fee });
  return { dl, fee, amount };
}

describe("ChainConnectV2", () => {
  it("1/2/3. books an escrow, takes payment, and holds funds in the contract", async () => {
    const f = await loadFixture(deploy);
    const feeBefore = await ethers.provider.getBalance(f.feeWallet.address);
    const { amount, fee } = await funded(f);
    const e = await f.c.getEscrow(0);
    expect(e.status).to.equal(Status.Funded);
    expect(e.escrowBalance).to.equal(amount);
    expect(await ethers.provider.getBalance(await f.c.getAddress())).to.equal(amount);
    expect(await ethers.provider.getBalance(f.feeWallet.address)).to.equal(feeBefore + fee);
    expect(await f.c.getTotalEscrows()).to.equal(1);
  });

  it("11. rejects incorrect payment amount", async () => {
    const f = await loadFixture(deploy);
    const dl = (await time.latest()) + 86400;
    await expect(
      f.c.connect(f.organizer).createEscrowNative(f.vendor.address, E("10"), dl, 5, { value: E("10") })
    ).to.be.revertedWith("Incorrect payment amount");
  });

  it("rejects self-hire, unregistered vendor, past deadline, penalty > 50", async () => {
    const f = await loadFixture(deploy);
    const dl = (await time.latest()) + 86400;
    const v = { value: E("10.1") };
    await expect(f.c.connect(f.vendor).createEscrowNative(f.vendor.address, E("10"), dl, 5, v)).to.be.revertedWith("Organizer cannot be vendor");
    await expect(f.c.connect(f.organizer).createEscrowNative(f.stranger.address, E("10"), dl, 5, v)).to.be.revertedWith("Vendor not registered");
    await expect(f.c.connect(f.organizer).createEscrowNative(f.vendor.address, E("10"), 1, 5, v)).to.be.revertedWith("Deadline must be in the future");
    await expect(f.c.connect(f.organizer).createEscrowNative(f.vendor.address, E("10"), dl, 51, v)).to.be.revertedWith("Penalty rate too high");
  });

  it("4/5. full flow: start -> complete -> release pays vendor minus 1% fee and mints Job NFT", async () => {
    const f = await loadFixture(deploy);
    const { amount } = await funded(f);
    await f.c.connect(f.vendor).startJob(0, "ipfs://proof");
    await f.c.connect(f.vendor).completeJob(0);
    const vBefore = await ethers.provider.getBalance(f.vendor.address);
    await expect(f.c.connect(f.organizer).releasePayment(0)).to.emit(f.c, "JobNFTMinted");
    const vendorFee = amount / 100n;
    expect(await ethers.provider.getBalance(f.vendor.address)).to.equal(vBefore + amount - vendorFee);
    expect((await f.c.getEscrow(0)).status).to.equal(Status.Released);
    expect(await ethers.provider.getBalance(await f.c.getAddress())).to.equal(0);
    expect((await f.c.getVendorProfile(f.vendor.address)).completedJobs).to.equal(1);
    expect((await f.c.getJobNFT(0)).jobId).to.equal(0);
    expect(await f.c.tokenURI(0)).to.match(/^data:application\/json;base64,/);
  });

  it("6/12. unauthorized parties cannot release, start, complete, approve or refund", async () => {
    const f = await loadFixture(deploy);
    await funded(f);
    await expect(f.c.connect(f.stranger).startJob(0, "x")).to.be.revertedWith("Only vendor");
    await expect(f.c.connect(f.organizer).startJob(0, "x")).to.be.revertedWith("Only vendor");
    await f.c.connect(f.vendor).startJob(0, "x");
    await expect(f.c.connect(f.stranger).completeJob(0)).to.be.revertedWith("Only vendor");
    await f.c.connect(f.vendor).completeJob(0);
    await expect(f.c.connect(f.vendor).releasePayment(0)).to.be.revertedWith("Only organizer");
    await expect(f.c.connect(f.stranger).releasePayment(0)).to.be.revertedWith("Only organizer");
    await expect(f.c.connect(f.stranger).refundEscrow(0)).to.be.revertedWith("Only organizer");
    await expect(f.c.connect(f.vendor).approveAdvancePayment(0)).to.be.revertedWith("Only organizer");
  });

  it("7. double release is rejected", async () => {
    const f = await loadFixture(deploy);
    await funded(f);
    await f.c.connect(f.vendor).startJob(0, "x");
    await f.c.connect(f.vendor).completeJob(0);
    await f.c.connect(f.organizer).releasePayment(0);
    await expect(f.c.connect(f.organizer).releasePayment(0)).to.be.revertedWith("Invalid status");
    await expect(f.c.connect(f.organizer).refundEscrow(0)).to.be.revertedWith("Refund not allowed");
  });

  it("10. invalid state transitions revert", async () => {
    const f = await loadFixture(deploy);
    await funded(f);
    await expect(f.c.connect(f.vendor).completeJob(0)).to.be.revertedWith("Invalid status");
    await expect(f.c.connect(f.organizer).releasePayment(0)).to.be.revertedWith("Invalid status");
    await expect(f.c.getEscrow(5)).to.be.revertedWith("Escrow does not exist");
  });

  it("8/9. cancellation: organizer refund while Funded returns the held amount", async () => {
    const f = await loadFixture(deploy);
    const { amount } = await funded(f);
    const before = await ethers.provider.getBalance(f.organizer.address);
    const tx = await f.c.connect(f.organizer).refundEscrow(0);
    const r = await tx.wait();
    const gas = r.gasUsed * r.gasPrice;
    expect(await ethers.provider.getBalance(f.organizer.address)).to.equal(before + amount - gas);
    expect((await f.c.getEscrow(0)).status).to.equal(Status.Refunded);
    await expect(f.c.connect(f.organizer).refundEscrow(0)).to.be.revertedWith("Refund not allowed");
  });

  it("refund after deadline when InProgress, but not before and not once Completed", async () => {
    const f = await loadFixture(deploy);
    const { dl } = await funded(f);
    await f.c.connect(f.vendor).startJob(0, "x");
    await expect(f.c.connect(f.organizer).refundEscrow(0)).to.be.revertedWith("Refund not allowed");
    await time.increaseTo(dl + 1);
    await f.c.connect(f.organizer).refundEscrow(0);
    expect((await f.c.getEscrow(0)).status).to.equal(Status.Refunded);

    await funded(f);
    await f.c.connect(f.vendor).startJob(1, "x");
    await f.c.connect(f.vendor).completeJob(1);
    await expect(f.c.connect(f.organizer).refundEscrow(1)).to.be.revertedWith("Refund not allowed");
  });

  it("advance: 15% goes to vendor once, release pays the rest", async () => {
    const f = await loadFixture(deploy);
    const { amount } = await funded(f);
    const v0 = await ethers.provider.getBalance(f.vendor.address);
    await f.c.connect(f.organizer).approveAdvancePayment(0);
    const adv = (amount * 1500n) / 10000n;
    expect(await ethers.provider.getBalance(f.vendor.address)).to.equal(v0 + adv);
    expect((await f.c.getEscrow(0)).escrowBalance).to.equal(amount - adv);
    await expect(f.c.connect(f.organizer).approveAdvancePayment(0)).to.be.revertedWith("Advance already approved");
    await f.c.connect(f.vendor).startJob(0, "x");
    await f.c.connect(f.vendor).completeJob(0);
    await f.c.connect(f.organizer).releasePayment(0);
    expect(await ethers.provider.getBalance(await f.c.getAddress())).to.equal(0);
  });

  it("late completion sends penalty to the organizer", async () => {
    const f = await loadFixture(deploy);
    const { dl, amount } = await funded(f, { penalty: 10 });
    await f.c.connect(f.vendor).startJob(0, "x");
    await time.increaseTo(dl + 10);
    await f.c.connect(f.vendor).completeJob(0);
    await expect(f.c.connect(f.organizer).releasePayment(0))
      .to.emit(f.c, "PenaltyPaid")
      .withArgs(0, f.organizer.address, amount / 10n);
  });

  it("vendor registry: active list, status toggle, levels", async () => {
    const f = await loadFixture(deploy);
    expect((await f.c.getActiveVendors()).length).to.equal(1);
    await f.c.connect(f.vendor).setVendorStatus(false);
    expect((await f.c.getActiveVendors()).length).to.equal(0);
    const dl = (await time.latest()) + 86400;
    await expect(
      f.c.connect(f.organizer).createEscrowNative(f.vendor.address, E("1"), dl, 0, { value: E("1.01") })
    ).to.be.revertedWith("Vendor not active");
    expect(await f.c.getTotalVendors()).to.equal(1);
  });

  it("organizer registry", async () => {
    const f = await loadFixture(deploy);
    await f.c.connect(f.organizer).registerOrganizer("Org", "o@x.io", "999");
    expect((await f.c.getOrganizerProfile(f.organizer.address)).name).to.equal("Org");
    await f.c.connect(f.organizer).setOrganizerStatus(false);
    expect((await f.c.getOrganizerProfile(f.organizer.address)).isActive).to.equal(false);
    expect(await f.c.getTotalOrganizers()).to.equal(1);
  });
});

describe("VerifiedNft", () => {
  it("self-mint once, owner can mint, transfers blocked, others cannot mint for you", async () => {
    const [owner, a, b] = await ethers.getSigners();
    const N = await ethers.getContractFactory("VerifiedNft");
    const n = await N.deploy("MonConnect Organizer", "MCORG", owner.address);
    await n.connect(a).safeMint(a.address);
    expect(await n.balanceOf(a.address)).to.equal(1);
    await expect(n.connect(a).safeMint(a.address)).to.be.revertedWith("Already verified");
    await expect(n.connect(a).safeMint(b.address)).to.be.revertedWith("Cannot mint for others");
    await n.connect(owner).safeMint(b.address);
    await expect(n.connect(a).transferFrom(a.address, b.address, 0)).to.be.reverted;
  });
});
