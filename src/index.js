require('dotenv').config({path:__dirname+'/./../.env'});
var axios = require('axios');
var Web3 = require('web3');
var web3 = new Web3(process.env.RPC_URL);

// abi you you get after deploying Swapper.sol contract
ABI_IERC20_CONTRACT = [{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]
ABI_SWAPPER_CONTRACT = [{"inputs":[{"internalType":"address","name":"srcToken","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"callData","type":"bytes"}],"name":"swap","outputs":[],"stateMutability":"payable","type":"function","payable":true}]

ADDRESS_SWAPPER_CONTRACT = "......." // You need to set with Swapper contract address

let srcToken = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" // ETH address/
// let srcToken = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" // WETH address
let srcDecimals = 18 // ETH/WETH decimals
let destToken = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" // USDC address
let destDecimals = 6 // USDC decimals
let amount = 0.1*10**srcDecimals + ''// amount to swap, 0.1 ETH/WETH with decimals = 100000000000000000
let network = 1 // Mainnet

async function main(srcToken, srcDecimals, destToken, destDecimals, amount, network){

    let queryParams = {
        srcToken: srcToken,
        destToken: destToken,
        srcDecimals: srcDecimals,
        destDecimals: destDecimals,
        amount: amount,
        network: network
    }

    let responseBestRate = await axios.get('https://apiv5.paraswap.io/prices', {params: queryParams}); // get best rate from paraswap
    let priceRoute = responseBestRate.data.priceRoute

    let amountWithSlippage = Number(priceRoute.destAmount) - (Number(priceRoute.destAmount) * 0.03) // 3% splippage allowed

    let params = {
        srcToken: srcToken,
        destToken: destToken,
        srcDecimals: srcDecimals,
        destDecimals: destDecimals,
        srcAmount: amount,
        destAmount: parseInt(amountWithSlippage) + '',
        priceRoute: priceRoute,
        userAddress: ADDRESS_SWAPPER_CONTRACT, // the address of smart contract that will call PARASWAP contract (Swapper address)
        txOrigin: process.env.TX_ORIGIN, // the address of the wallet that will send the transaction
        receiver: ADDRESS_SWAPPER_CONTRACT, // the address of the wallet that will receive the output amount of the swap, in my case receiver is Swapper contract
    }

    // ignoreChecks=true is to avoid checking balances and allowances
    let responseTXBuild = await axios.post('https://apiv5.paraswap.io/transactions/'+network+'?ignoreChecks=true', params) // build transaction

    let calldata = responseTXBuild.data.data

    let srcToken_contract = new web3.eth.Contract(ABI_IERC20_CONTRACT, srcToken)
    let swapper_contract = new web3.eth.Contract(ABI_SWAPPER_CONTRACT, ADDRESS_SWAPPER_CONTRACT)

    let ethAmountToTransfert = 0
    if(srcToken.toLowerCase() == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"){
        if(await web3.eth.getBalance(process.env.TX_ORIGIN) < amount){ // check tx.origin ETH balance
            throw new Error("You have not enough ETH to do the swap !")
        }
        ethAmountToTransfert = amount
    }else{
        if(await srcToken_contract.methods.balanceOf(process.env.TX_ORIGIN).call() < amount){ // check tx.origin srcToken balance
            throw new Error("You have not enough srcToken to do the swap !")
        }
        if(await srcToken_contract.methods.allowance(process.env.TX_ORIGIN, ADDRESS_SWAPPER_CONTRACT).call() < amount){ //check and approve if we have not enough allowance
            await srcToken_contract.methods.approve(ADDRESS_SWAPPER_CONTRACT, amount).send({from: process.env.TX_ORIGIN})
        }
        console.log(await srcToken_contract.methods.allowance(process.env.TX_ORIGIN, ADDRESS_SWAPPER_CONTRACT).call())
        console.log(await srcToken_contract.methods.balanceOf(process.env.TX_ORIGIN).call())
    }

    swapper_contract.methods.swap(srcToken, amount, calldata).send({from: process.env.TX_ORIGIN, value: ethAmountToTransfert + ''})
    .on('transactionHash', function(hash){
        console.log(hash)
    })
    .on('receipt', function(receipt){
        console.log(receipt);
    })
    .on('error', function(error, receipt) {
        console.log(error)
    });
}

main(srcToken, srcDecimals, destToken, destDecimals, amount, network)
