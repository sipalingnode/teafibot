require('dotenv').config();
const { ethers } = require('ethers');
const fetch = require('node-fetch');
const chalk = require('chalk');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Baca daftar proxy dari file proxy.txt
const proxies = fs.readFileSync('proxy.txt', 'utf8').split('\n').filter(Boolean);

// Fungsi untuk mendapatkan proxy secara bergiliran
let currentProxyIndex = 0;
const getNextProxy = () => {
    const proxy = proxies[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
    return proxy;
};

// Fungsi untuk mendapatkan IP eksternal
const getCurrentIP = async (agent) => {
    try {
        const response = await fetch('https://api.ipify.org?format=json', {
            agent: agent
        });
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error(chalk.red("[ASC] Gagal mendapatkan IP proxy:", error));
        return "Unknown";
    }
};

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const TPOL_ABI = JSON.parse(fs.readFileSync('abi.json', 'utf8'));

const privateKeys = process.env.PRIVATE_KEY.split(',');

const RPC_URL = config.RPC_URL;
const provider = new ethers.JsonRpcProvider(RPC_URL);

const TPOL_ADDRESS = config.TPOL_ADDRESS;
const WMATIC_ADDRESS = config.WMATIC_ADDRESS;
const APi_TOTAL_POINT = config.APi_TOTAL_POINT;
const API_URL_CHECK_IN = config.API_URL_CHECK_IN;
const API_URL_CURRENT = config.API_URL_CURRENT;
const API_URLS = config.API_URLS;

const headers = {
    "Content-Type": "application/json",
    "Origin": "https://app.tea-fi.com",
    "Referer": "https://app.tea-fi.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

const accountTxCount = {};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi untuk mengecek status check-in terakhir
const checkLastCheckInStatus = async (walletAddress) => {
    try {
        const proxy = getNextProxy();
        const agent = new HttpsProxyAgent(`http://${proxy}`);

        // Tampilkan IP proxy yang sedang digunakan
        const currentIP = await getCurrentIP(agent);
        console.log(chalk.yellow(`[ASC] Proxy IP: ${currentIP}`));

        const response = await fetch(`${API_URL_CURRENT}?address=${walletAddress}`, {
            method: "GET",
            headers: headers,
            agent: agent
        });

        const data = await response.json();

        if (response.status === 200) {
            const lastCheckInDate = new Date(data.lastCheckIn);
            const today = new Date();

            if (
                lastCheckInDate.getUTCFullYear() === today.getUTCFullYear() &&
                lastCheckInDate.getUTCMonth() === today.getUTCMonth() &&
                lastCheckInDate.getUTCDate() === today.getUTCDate()
            ) {
                console.log(chalk.green("[ASC] Already checked in today. Next check-in at 00:05 UTC."));
                return true;
            } else {
                console.log(chalk.yellow("[ASC] You haven't checked in today. Proceeding to check-in..."));
                return false;
            }
        } else {
            console.log(chalk.red("[ASC] Failed to fetch check-in status."));
            return false;
        }
    } catch (error) {
        console.error(chalk.red("[ASC] Error fetching check-in status:", error));
        return false;
    }
};

// Fungsi untuk melakukan daily check-in
const dailyCheckIn = async (walletAddress, retryCount = 3) => {
    try {
        const proxy = getNextProxy();
        const agent = new HttpsProxyAgent(`http://${proxy}`);

        // Tampilkan IP proxy yang sedang digunakan
        const currentIP = await getCurrentIP(agent);
        console.log(chalk.blue(`[ASC] Using proxy: ${proxy}`));
        console.log(chalk.blue(`[ASC] Current IP: ${currentIP}`));

        const payload = { address: walletAddress };
        const response = await fetch(`${API_URL_CHECK_IN}?address=${walletAddress}`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload),
            agent: agent
        });

        const data = await response.json();

        if (response.status === 201) {
            console.log(chalk.yellow(`[ASC] Check-in success!`));
        } else if (response.status === 400 && data.message === "Already checked in today") {
            console.log(chalk.green(`[ASC] Already checked in today. Next check-in at 00:05 UTC.`));
        } else if (response.status === 400) {
            if (retryCount > 0) {
                await delay(2000);
                await dailyCheckIn(walletAddress, retryCount - 1);
            } else {
                console.log(chalk.red(`[ASC] Gagal Check-in setelah 3 kali percobaan`));
            }
        }
    } catch (error) {
        console.error(chalk.red("\n[ERROR] Gagal menghubungi API:", error));
    }
};

// Fungsi untuk mendapatkan balance WPOL
const getWPOLBalance = async (wallet) => {
    const WPOL_ADDRESS = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270";
    const wpolContract = new ethers.Contract(WPOL_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const balance = await wpolContract.balanceOf(wallet.address);
    return ethers.formatEther(balance);
};

// Fungsi untuk mendapatkan balance POL
const getPOLBalance = async (wallet) => {
    const balance = await provider.getBalance(wallet.address);
    return ethers.formatEther(balance);
};

// Fungsi untuk mendapatkan gas quote
const getGasQuote = async () => {
    try {
        const proxy = getNextProxy();
        const agent = new HttpsProxyAgent(`http://${proxy}`);

        const response = await fetch(
            `https://api.polygonscan.com/api?module=gastracker&action=gasoracle`,
            {
                headers: headers,
                agent: agent
            }
        );
        const data = await response.json();
        if (data.status === "1" && data.result) {
            const gasPriceGwei = data.result.FastGasPrice;
            console.log(chalk.green(`[ASC] Gas Fee: ${gasPriceGwei} Gwei`));
            return ethers.parseUnits(gasPriceGwei, "gwei");
        } else {
            console.log(chalk.red("[ASC] Error fetching gas data from PolygonScan"));
            throw new Error('Failed to fetch gas price');
        }
    } catch (error) {
        console.error(chalk.red("[ASC] Error fetching gas quote:", error));
        throw error;
    }
};

// Fungsi untuk melakukan wrap
const performWrap = async (walletIndex, txCount) => {
    const wallet = new ethers.Wallet(privateKeys[walletIndex], provider);
    const tpolContract = new ethers.Contract(TPOL_ADDRESS, TPOL_ABI, wallet);
    const amount = ethers.parseEther("0.0001");

    try {
        if (!accountTxCount[walletIndex]) {
            accountTxCount[walletIndex] = 0;
        }
        accountTxCount[walletIndex]++;

        console.log(chalk.yellow(`\n[ASC] AUTOSWAP by AirdropASC | Account ${walletIndex + 1} | Total tx: ${accountTxCount[walletIndex]}`));
        console.log(chalk.yellow("[ASC] =================================================="));

        const wpolBalance = await getWPOLBalance(wallet);
        console.log(chalk.cyan(`[ASC] Balance WPOL: ${wpolBalance}`));

        const polBalance = await getPOLBalance(wallet);
        console.log(chalk.cyan(`[ASC] Balance POL: ${polBalance}`));

        if (parseFloat(wpolBalance) < 0.0001 || parseFloat(polBalance) < 0.1) {
            console.log(chalk.red("[ASC] Balance WPOL atau POL tidak mencukupi. Bot berhenti."));
            return;
        }

        const wrapGasFee = await getGasQuote();

        const wrapTx = await tpolContract.wrap(
            amount,
            wallet.address,
            {
                gasPrice: wrapGasFee
            }
        );
        console.log(chalk.green(`[ASC] WPOL to TPOL txid: ${wrapTx.hash}`));

        for (let i = 5; i >= 0; i--) {
            await delay(1000);
            process.stdout.write(`\r${chalk.blue("[ASC] Waiting Confirmation... " + i)} `);
        }

        console.log("\n" + chalk.green("[ASC] Wrap Sukses!"));

        await notifyTransaction(wallet.address, wrapTx.hash, wrapGasFee);

    } catch (error) {
        console.error(chalk.red(`[ASC] Wrap process failed:`, error));
    }
};

// Fungsi untuk notifikasi transaksi
const notifyTransaction = async (walletAddress, hash, gasFeeAmount) => {
    try {
        const proxy = getNextProxy();
        const agent = new HttpsProxyAgent(`http://${proxy}`);

        const payload = {
            blockchainId: 137,
            type: 2,
            walletAddress: walletAddress,
            hash: hash,
            fromTokenAddress: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
            toTokenAddress: "0x1Cd0cd01c8C902AdAb3430ae04b9ea32CB309CF1",
            fromTokenSymbol: "WPOL",
            toTokenSymbol: "tPOL",
            fromAmount: "100000000000000",
            toAmount: "100000000000000",
            gasFeeTokenAddress: "0x0000000000000000000000000000000000000000",
            gasFeeTokenSymbol: "POL",
            gasFeeAmount: gasFeeAmount
        };

        const response = await fetch(config.API_URLS.TRANSACTION, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload),
            agent: agent
        });

        const result = await response.json();
        if (response.status === 201) {
            console.log(chalk.green(`[ASC] Earn Cubes: ${result.pointsAmount}`));
        } else {
            console.log(chalk.red("[ASC] API notification failed:", result));
        }
    } catch (error) {
        console.error(chalk.red("[ASC] Failed to notify API:", error));
    }
};

// Fungsi untuk melakukan check-in dan wrap
const checkInAndWrap = async (walletIndex, txCount) => {
    const wallet = new ethers.Wallet(privateKeys[walletIndex], provider);

    const hasCheckedIn = await checkLastCheckInStatus(wallet.address);
    if (!hasCheckedIn) {
        await dailyCheckIn(wallet.address);
    }

    await performWrap(walletIndex, txCount);
};

// Loop untuk setiap akun
const loopCheckInAndWrapForever = async () => {
    let txCount = 0;

    while (true) {
        const walletIndex = txCount % privateKeys.length;
        txCount++;

        await checkInAndWrap(walletIndex, txCount);

        for (let i = 5; i >= 0; i--) {
            await delay(1000);
            process.stdout.write(`\r${chalk.blue("[ASC] Next Swap in... " + i)} `);
        }
        console.log("\n");
    }
};

// Jalankan skrip
(async () => {
    await loopCheckInAndWrapForever();
})();
