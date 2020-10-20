import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


// File: contracts/RealioLPStaking.sol

pragma solidity 0.6.12;


// Realio LP Staking - honeypot contract allows users to earn RIO for holding liquidity on Uniswap.
//
//
// Note that it's ownable and the honeypot once funded, can never be touched
//
// User deposits LP tokens into Pool for RIO rewards
// RIO rewards recalculated at each deposit or withdrawal
//
//
contract RealioLPStaking is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;       // How many LP tokens the user has provided.
        uint256 rewardDebt;   // Reward debt.
        //
        // rewardDebt is the accumulation of the user's estimated shares since the last harvest.
        //
        // reward: any point in time, the amount of RIOs entitled to a user but is pending to be distributed is
        //
        //   pending reward = (user.amount * pool.accRioPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accRioPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;                    // Address of LP token contract.
        uint256 perBlockRioAllocated;      // Number of RIO to distribute per block.
        uint256 lastRewardBlock;           // Last block number that RIOs distribution occurs.
        uint256 accRioPerShare;            // Accumulated RIOs per share, times 1e12. See below.
    }

    // Address of RIO token contract.
    IERC20 public rioTokenContract;
    // RIO tokens created per block.
    uint256 public rioRewardPerBlock;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocRioPerBlock = 0;
    // The block number when RIO mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event ContractFunded(address indexed from, uint256 amount);

    constructor(
        IERC20 _rioContractAddress,
        uint256 _rioPerBlock,
        uint256 _startBlock
    ) public {
        rioTokenContract = _rioContractAddress;
        rioRewardPerBlock = _rioPerBlock;
        startBlock = _startBlock;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    //////////////////
    //
    // OWNER functions
    //
    //////////////////

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _rioPerBlock, IERC20 _lpToken, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocRioPerBlock = totalAllocRioPerBlock.add(_rioPerBlock);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            perBlockRioAllocated: _rioPerBlock,
            lastRewardBlock: lastRewardBlock,
            accRioPerShare: 0
            }));
    }

    // Update the given pool's RIO per block. Can only be called by the owner.
    function set(uint256 _poolId, uint256 _rioPerBlock, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocRioPerBlock = totalAllocRioPerBlock.sub(poolInfo[_poolId].perBlockRioAllocated).add(_rioPerBlock);
        poolInfo[_poolId].perBlockRioAllocated = _rioPerBlock;
    }

    // fund the contract with RIO. _from address must have approval to execute Rio Token Contract transferFrom
    function fund(address _from, uint256 _amount) public {
        require(_from != address(0), 'fund: must pass valid _from address');
        require(_amount > 0, 'fund: expecting a positive non zero _amount value');
        require(rioTokenContract.balanceOf(_from) >= _amount, 'fund: expected an address that contains enough RIO for Transfer');
        rioTokenContract.transferFrom(_from, address(this), _amount);
        emit ContractFunded(_from, _amount);
    }

    //////////////////
    //
    // VIEW functions
    //
    //////////////////

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public pure returns (uint256) {
        return _to.sub(_from);
    }

    // View function to see pending RIOs on frontend.
    // (user.amount * pool.accRioPerShare) - rewardDebt
    function pendingRioReward(uint256 _poolId, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_poolId];
        UserInfo storage user = userInfo[_poolId][_user];
        uint256 accRioPerShare = pool.accRioPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply < 0) {
            return 0;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 rioReward = multiplier.mul(rioRewardPerBlock).mul(pool.perBlockRioAllocated).div(totalAllocRioPerBlock);
        accRioPerShare = accRioPerShare.add(rioReward.mul(1e12).div(lpSupply));
        return user.amount.mul(accRioPerShare).div(1e12).sub(user.rewardDebt);
    }

    // View function to see contract held RIO on frontend.
    function getLockedRioView() external view returns (uint256) {
        return rioTokenContract.balanceOf(address(this));
    }

    // View function to see pool held LP Tokens
    function getLpSupply(uint256 _poolId) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_poolId];
        return pool.lpToken.balanceOf(address(this));
    }

    //////////////////
    //
    // PUBLIC functions
    //
    //////////////////


    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update pool supply and reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _poolId) public {
        PoolInfo storage pool = poolInfo[_poolId];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 rioReward = multiplier.mul(rioRewardPerBlock).mul(pool.perBlockRioAllocated).div(totalAllocRioPerBlock);
        pool.accRioPerShare = pool.accRioPerShare.add(rioReward.mul(1e12).div(lpSupply));

        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterChef for RIO allocation.
    function deposit(uint256 _poolId, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_poolId];
        UserInfo storage user = userInfo[_poolId][msg.sender];
        updatePool(_poolId);
        // if user already has LP tokens in the pool execute harvest for the user
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accRioPerShare).div(1e12).sub(user.rewardDebt);
            safeRioTransfer(msg.sender, pending);
        }
        pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
        user.amount = user.amount.add(_amount);
        user.rewardDebt = user.amount.mul(pool.accRioPerShare).div(1e12);

        emit Deposit(msg.sender, _poolId, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accRioPerShare).div(1e12).sub(user.rewardDebt);

        safeRioTransfer(address(msg.sender), pending);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accRioPerShare).div(1e12);

        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
    }

    //////////////////
    //
    // INTERNAL functions
    //
    //////////////////

    // Safe RIO transfer function, just in case if rounding error causes pool to not have enough RIOs.
    function safeRioTransfer(address _to, uint256 _amount) internal {
        address _from = address(this);
        uint256 rioBal = rioTokenContract.balanceOf(_from);
        if (_amount > rioBal) {
            rioTokenContract.transfer(_to, rioBal);
        } else {
            rioTokenContract.transfer(_to, _amount);
        }
    }
}
