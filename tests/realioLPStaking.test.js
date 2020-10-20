const { accounts, defaultSender, contract, web3, provider, isHelpersConfigured } = require('@openzeppelin/test-environment');

const { expect, assert } = require('chai');


// Import utilities from Test Helpers
const { BN, expectEvent, expectRevert, time, ether } = require('@openzeppelin/test-helpers');


describe('RealioLPStaking smart contract', () => {

  const [owner, staker1, staker2, staker3] = accounts;
  const chef = contract.fromArtifact('RealioLPStaking');
  const rioToken = contract.fromArtifact('RIOToken');
  const lpToken = contract.fromArtifact('LPToken');
  const rioRewardPerBlock = web3.utils.toWei('5')
  const startBlock = 5

  before(async () => {
    try {
      this.tokenContract = await rioToken.new({ from: owner })
      this.lpTokenContract = await lpToken.new({ from: owner })
      this.chefBoyRDContract = await chef.new(this.tokenContract.address, rioRewardPerBlock, startBlock)

    } catch (e) {
      console.log(JSON.stringify(e))
      assert.fail('no error', 'error', `got an error=${e}`, null)
    }
  })

  it('should fund', async () => {
    const fundingAmount = web3.utils.toWei('1000000')
    try {
      const approvalResult = await this.tokenContract.approve(this.chefBoyRDContract.address, fundingAmount, { from: owner })
      expect(approvalResult.tx).to.be.exist
      const fundResult = await this.chefBoyRDContract.fund(owner, fundingAmount, { from: owner })
      expect(fundResult.tx).to.be.exist
    } catch (e) {
      console.log(JSON.stringify(e))
      assert.fail('no error', 'error', `got an error=${e}`, null)
    }
  })

  it('creates a pool', async () => {
    //await this.chefBoyRDContract.add(5, this.lpTokenContract.address, false);

    // Test if the returned value is the same one
    // Note that we need to use strings to compare the 256 bit integers
    const poolAmount = web3.utils.toWei('5')
    try {
      const poolResult = await this.chefBoyRDContract.add(poolAmount, this.lpTokenContract.address, false)
      expect(poolResult.tx).to.be.exist
    } catch (e) {
      console.log(JSON.stringify(e))
      assert.fail('no error', 'error', `got an error=${e}`, null)
    }
  });

  describe('earning rio',  () => {

    beforeEach(async () => {
      const blockNumber = await web3.eth.getBlockNumber();
      await time.advanceBlockTo(blockNumber + 10)
    })

    it('should allow user to stake in pool', async () => {
      try {
        let lpTokenAmount = web3.utils.toWei('12.6')
        const lpStakers = [staker1, staker2, staker3]

        for (let i=0;i<lpStakers.length;i++) {
          console.log(`staking ${lpTokenAmount} for ${lpStakers[i]}`)
          const lpTokenResult = await this.lpTokenContract.transfer(lpStakers[i], lpTokenAmount, {from: owner})
          expect(lpTokenResult.tx).to.be.exist
          //console.log(`transfer result ${JSON.stringify(lpTokenResult, null, 2)}`)
          const approvalResult = await this.lpTokenContract.approve(this.chefBoyRDContract.address, lpTokenAmount, {from: lpStakers[i]})
          expect(approvalResult.tx).to.be.exist
          const lpSupply = await this.chefBoyRDContract.getLpSupply(0, {from: staker3})
          console.log(`lpSupply=${lpSupply.toString(10)}`)
          const poolInfo = await this.chefBoyRDContract.poolInfo(0, {from: owner})
          console.log(`poolInfo=${JSON.stringify({
            lpToken: poolInfo.lpToken,
            perBlockRioAllocated: poolInfo.perBlockRioAllocated.toString(10),
            lastRewardBlock: poolInfo.lastRewardBlock.toString(10),
            accRioPerShare: poolInfo.accRioPerShare.toString(10)
          }, null, 2)}`)
          const blockNumber = await web3.eth.getBlockNumber();
          const multiplier = await this.chefBoyRDContract.getMultiplier(+poolInfo.lastRewardBlock.toString(10), blockNumber, {from: owner})
          console.log(`multiplier=${multiplier.toString(10)}`)
          console.log(`blockNumber ${blockNumber}`)
          const result = await this.chefBoyRDContract.deposit(0, lpTokenAmount, {from: lpStakers[i]})
          expect(result.tx).to.be.exist
          const userInfo = await this.chefBoyRDContract.userInfo(0, lpStakers[i], {from: owner})
          console.log(`userInfo=${JSON.stringify({
            rewardDebt: userInfo.rewardDebt.toString(10),
            amount: userInfo.amount.toString(10)  }, null, 2)}\n\n`)
          expect(userInfo.amount.eq(+ether('12.6')))
          await time.advanceBlock()
        }

      } catch (e) {
        console.log(JSON.stringify(e))
        assert.fail('no error', 'error', `got an error=${e}`, null)
      }
    })

    it('should allow stakers to withdraw from the pool', async () => {
      try {
        console.log(`staker3 harvest`)
        let ownedRio = await this.tokenContract.balanceOf(staker3)
        expect(+ownedRio.toString(10)).to.be.eq(0)
        const blockNumber = await web3.eth.getBlockNumber();
        console.log(`blockNumber ${blockNumber}`)
        const lpSupply = await this.chefBoyRDContract.getLpSupply(0, {from: staker3})
        console.log(`lpSupply=${lpSupply.toString(10)}`)
        const pendingRio = await this.chefBoyRDContract.pendingRioReward(0, staker3)
        console.log(`pendingRio=${pendingRio.toString(10)}`)
        const staker1PendingRio = await this.chefBoyRDContract.pendingRioReward(0, staker1)
        console.log(`staker1PendingRio=${staker1PendingRio.toString(10)}`)
        const staker2PendingRio = await this.chefBoyRDContract.pendingRioReward(0, staker2)
        console.log(`staker2PendingRio=${staker2PendingRio.toString(10)}`)
        const _user = await this.chefBoyRDContract.userInfo(0, staker3, {from: owner})
        console.log(`user=${JSON.stringify({
          rewardDebt: _user.rewardDebt.toString(10),
          amount: _user.amount.toString(10)  }, null, 2)}`)
        const staker1User = await this.chefBoyRDContract.userInfo(0, staker1, {from: owner})
        console.log(`staker1User=${JSON.stringify({
          rewardDebt: staker1User.rewardDebt.toString(10),
          amount: staker1User.amount.toString(10)  }, null, 2)}`)
        const staker2User = await this.chefBoyRDContract.userInfo(0, staker2, {from: owner})
        console.log(`staker2User=${JSON.stringify({
          rewardDebt: staker2User.rewardDebt.toString(10),
          amount: staker2User.amount.toString(10)  }, null, 2)}`)
        const poolInfo = await this.chefBoyRDContract.poolInfo(0, {from: owner})
        console.log(`pool.lastRewardBlock=${poolInfo.lastRewardBlock.toString(10)}`)
        console.log(`poolInfo=${JSON.stringify({
          lpToken: poolInfo.lpToken,
          perBlockRioAllocated: poolInfo.perBlockRioAllocated,
          lastRewardBlock: poolInfo.lastRewardBlock.toString(10)
        }, null, 2)}`)
        const withdrawTokenAmount = web3.utils.toWei('2.1')
        const result = await this.chefBoyRDContract.withdraw(0, withdrawTokenAmount, {from: staker3})
        expect(result.tx).to.be.exist
        const user = await this.chefBoyRDContract.userInfo(0, staker3)
        expect(user.amount.eq(+('10.5')))
        ownedRio = await this.tokenContract.balanceOf(staker3)
        console.log(`rio transferred ${ownedRio.toString(10)}`)
        expect(+ownedRio.toString(10)).to.be.greaterThan(0)
      } catch (e) {
        console.log(JSON.stringify(e))
        assert.fail('no error', 'error', `got an error=${e}`, null)
      }
    })

    it('should update the pools', async () => {
      try {
        const blockNumber = await web3.eth.getBlockNumber();
        let poolInfo = await this.chefBoyRDContract.poolInfo(0, {from: owner})
        expect(+poolInfo.lastRewardBlock).to.be.lessThan(blockNumber)
        console.log(`poolInfo=${JSON.stringify(poolInfo, null, 2)}`)
        const result = await this.chefBoyRDContract.updatePool(0, {from: owner})
        expect(result.tx).to.be.exist
        poolInfo = await this.chefBoyRDContract.poolInfo(0, {from: owner})
        expect(+poolInfo.lastRewardBlock).to.be.greaterThan(blockNumber)
      } catch (e) {
        console.log(JSON.stringify(e))
        assert.fail()
      }
    })

    it('should get current lpSupply', async () => {
      try {
        let lpSupply = await this.chefBoyRDContract.getLpSupply(0, {from: staker1})
        console.log(`Total Pool Supply=${JSON.stringify(lpSupply.toString(10))}`)
        expect(+lpSupply).to.be.greaterThan(0)
      } catch (e) {
        console.log(JSON.stringify(e))
        assert.fail('no error', 'error', `got an error=${e}`, null)
      }
    })

    it('should get pending rio reward', async () => {
      try {
        // update the pool
        const pendingRioReward = await this.chefBoyRDContract.pendingRioReward(0, staker1, {from: staker1})
        console.log(`Pending reward for staker1=${JSON.stringify(pendingRioReward.toString(10))}`)
        expect(+pendingRioReward.toString(10)).to.be.greaterThan(0)

      } catch (e) {
        console.log(JSON.stringify(e))
        assert.fail('no error', 'error', `got an error=${e}`, null)
      }
    })

    it('should allow user to harvest rio', async () => {
      const staker = staker2
      const beforeOwnedRio = await this.tokenContract.balanceOf(staker)
      const pendingRioReward = await this.chefBoyRDContract.pendingRioReward(0, staker, {from: staker})
      const result = await this.chefBoyRDContract.deposit(0, 0, {from: staker})
      expect(result.tx).to.be.exist
      const ownedRio = await this.tokenContract.balanceOf(staker)
      const expectedRioBalance = beforeOwnedRio.add(pendingRioReward)
      assert.isTrue(ownedRio.gt(beforeOwnedRio))
      assert.isTrue(ownedRio.gt(expectedRioBalance))
    })
  })


})