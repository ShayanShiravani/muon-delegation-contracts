// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

contract MuonDelegatorRewards is Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public muonToken;
    address public delegationNodeStaker;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public startDates;
    mapping(address => bool) public restake;
    mapping(address => uint256) public userIndexes;

    uint256 public lastDisTime;

    address[] public allUsers;

    event Staked(address indexed user, uint256 balance, uint256 amount);

    event Rewarded(address indexed user, uint256 balance, uint256 amount);

    function initialize(
        address _muonTokenAddress,
        uint256 _lastDisTime,
        address _nodeStaker
    ) public initializer {
        __MuonDelegatorRewards_init(
            _muonTokenAddress,
            _lastDisTime,
            _nodeStaker
        );
    }

    function __MuonDelegatorRewards_init(
        address _muonTokenAddress,
        uint256 _lastDisTime,
        address _nodeStaker
    ) internal onlyInitializing {
        __Ownable_init();
        __MuonDelegatorRewards_init_unchained(
            _muonTokenAddress,
            _lastDisTime,
            _nodeStaker
        );
    }

    function __MuonDelegatorRewards_init_unchained(
        address _muonTokenAddress,
        uint256 _lastDisTime,
        address _nodeStaker
    ) internal onlyInitializing {
        muonToken = _muonTokenAddress;
        lastDisTime = _lastDisTime;
        delegationNodeStaker = _nodeStaker;
    }

    function distribute(uint256 amount, uint256 time) external onlyOwner {
        uint256[] memory amounts = calcAmounts(amount, time);
        for (uint256 i = 0; i < allUsers.length; i++) {
            if (amounts[i] > 0) {
                if (!restake[allUsers[i]]) {
                    IERC20Upgradeable(muonToken).transfer(
                        allUsers[i],
                        amounts[i]
                    );
                    emit Rewarded(
                        allUsers[i],
                        balances[allUsers[i]],
                        amounts[i]
                    );
                } else {
                    // TODO: consider boosting
                    emit Rewarded(
                        allUsers[i],
                        balances[allUsers[i]],
                        amounts[i]
                    );
                    balances[allUsers[i]] += amounts[i];
                }
            }
        }
        lastDisTime = time;
    }

    function setLastDisTime(uint256 time) external onlyOwner {
        lastDisTime = time;
    }

    function bulkImport(
        address[] memory addrs,
        uint256[] memory _balances,
        uint256[] memory _startDates,
        bool[] memory _restakes
    ) external onlyOwner {
        for (uint256 i = 0; i < addrs.length; i++) {
            address addr = addrs[i];
            balances[addr] = _balances[i];
            startDates[addr] = _startDates[i];
            restake[addr] = _restakes[i];
            allUsers.push(addr);
            userIndexes[addr] = allUsers.length;
        }
    }

    function removeUser(uint256 index) external onlyOwner {
        allUsers[index] = allUsers[allUsers.length - 1];
        allUsers.pop();
    }

    function adminWithdraw(
        uint256 amount,
        address _to,
        address _tokenAddr
    ) external onlyOwner {
        require(_to != address(0));
        if (_tokenAddr == address(0)) {
            payable(_to).transfer(amount);
        } else {
            IERC20Upgradeable(_tokenAddr).transfer(_to, amount);
        }
    }

    function stake(uint256 _amount, address _user) external {
        require(userIndexes[_user] != 0, "Invalid user");

        uint256 balance = IERC20Upgradeable(muonToken).balanceOf(
            delegationNodeStaker
        );
        IERC20Upgradeable(muonToken).safeTransferFrom(
            msg.sender,
            delegationNodeStaker,
            _amount
        );
        uint256 receivedAmount = IERC20Upgradeable(muonToken).balanceOf(
            delegationNodeStaker
        ) - balance;
        require(_amount == receivedAmount, "Invalid received amount");

        uint256 b1t1 = balances[_user] * startDates[_user];
        uint256 b2t2 = block.timestamp * _amount;
        uint256 newStartDate = (b1t1 + b2t2) / (balances[_user] + _amount);

        balances[_user] += _amount;
        startDates[_user] = newStartDate;

        emit Staked(_user, balances[_user], _amount);
    }

    function calcAmounts(
        uint256 amount,
        uint256 time
    ) public view returns (uint256[] memory out) {
        uint256 totalSecs = 0;
        uint256 periodSecs = time - lastDisTime;

        out = new uint256[](allUsers.length);
        for (uint256 i = 0; i < allUsers.length; i++) {
            uint256 userSecs = periodSecs;
            if (startDates[allUsers[i]] > lastDisTime) {
                userSecs = time - startDates[allUsers[i]];
            }
            totalSecs += balances[allUsers[i]] * userSecs;
            out[i] = balances[allUsers[i]] * userSecs;
        }

        for (uint256 i = 0; i < allUsers.length; i++) {
            out[i] = (out[i] * amount) / totalSecs;
        }
    }

    function transferable(
        uint256 amount,
        uint256 time
    ) external view returns (uint256) {
        uint256[] memory amounts = calcAmounts(amount, time);
        uint256 out = 0;
        for (uint256 i = 0; i < allUsers.length; i++) {
            if (amounts[i] > 0) {
                if (!restake[allUsers[i]]) {
                    out += amounts[i];
                }
            }
        }
        return out;
    }
}
