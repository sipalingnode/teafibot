require('dotenv').config();
const { ethers } = require('ethers');
const fetch = require('node-fetch');
const chalk = require('chalk');
const fs = require('fs');
const cron = require('node-cron');

// Memuat konfigurasi dan ABI dari file JSON
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const TPOL_ABI = JSON.parse(fs.readFileSync('abi.json', 'utf8'));

// Mendapatkan private keys dari .env dan memisahkannya menjadi array
const privateKeys = process.env.PRIVATE_KEY.split(',');

// Konfigurasi RPC dan provider
const RPC_URL = config.RPC_URL;
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Alamat kontrak dan API
const TPOL_ADDRESS = config.TPOL_ADDRESS;
const WMATIC_ADDRESS = config.WMATIC_ADDRESS;
const APi_TOTAL_POINT = config.APi_TOTAL_POINT;
const API_URL_CHECK_IN = config.API_URL_CHECK_IN;
const API_URL_CURRENT = config.API_URL_CURRENT;
const API_URLS = config.API_URLS;

// Headers untuk semua request API
const headers = {
    "Content-Type": "application/json",
    "Origin": "https://app.tea-fi.com",
    "Referer": "https://app.tea-fi.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// Fungsi untuk menambahkan delay sebelum mencoba lagi
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fungsi untuk mengecek status check-in terakhir
const checkLastCheckInStatus = async (walletAddress) => {
    try {
        const response = await fetch(`${API_URL_CURRENT}?address=${walletAddress}`, {
            method: "GET",
            headers: headers,
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
                return true; // Sudah check-in hari ini
            } else {
                console.log(chalk.yellow("[ASC] You haven't checked in today. Proceeding to check-in..."));
                return false; // Belum check-in hari ini
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

// Fungsi untuk melakukan POST request (check-in)
const dailyCheckIn = async (walletAddress, retryCount = 3) => {
    try {
        const payload = { address: walletAddress };
        const response = await fetch(`${API_URL_CHECK_IN}?address=${walletAddress}`, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.status === 201) {
            console.log(chalk.green(`[ASC] Check-in berhasil!`));
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

// Fungsi untuk mendapatkan Balance WPOL
const getWPOLBalance = async (wallet) => {
    const WPOL_ADDRESS = "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"; // Alamat kontrak WPOL
    const wpolContract = new ethers.Contract(WPOL_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const balance = await wpolContract.balanceOf(wallet.address);
    return ethers.formatEther(balance); // Konversi ke dalam format ether
};

// Fungsi untuk mendapatkan Balance POL (MATIC)
const getPOLBalance = async (wallet) => {
    const balance = await provider.getBalance(wallet.address);
    return ethers.formatEther(balance); // Konversi ke dalam format ether
};

// Fetch gas quote from API
const getGasQuote = async () => {
    try {
        const response = await fetch(
            `${config.API_URLS.GAS_QUOTE}?chain=137&txType=2&gasPaymentToken=0x0000000000000000000000000000000000000000&neededGasPermits=0`,
            {
                headers: headers
            }
        );
        const data = await response.json();
        return data.gasInGasPaymentToken;
    } catch (error) {
        console.error(chalk.red("[ASC] Error fetching gas quote:", error));
        throw error;
    }
};

// Notifikasi API dengan hash transaksi
const notifyTransaction = async (walletAddress, hash, gasFeeAmount) => {
    try {
        const payload = {
            blockchainId: 137,
            type: 2,  // Tipe 2 untuk wrap
            walletAddress: walletAddress,
            hash: hash,
            fromTokenAddress: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WPOL
            toTokenAddress: "0x1Cd0cd01c8C902AdAb3430ae04b9ea32CB309CF1",   // TPOL
            fromTokenSymbol: "WPOL",
            toTokenSymbol: "tPOL",
            fromAmount: "100000000000000", // 0.0001 WPOL
            toAmount: "100000000000000",   // 0.0001 TPOL
            gasFeeTokenAddress: "0x0000000000000000000000000000000000000000", // Gas fee in MATIC
            gasFeeTokenSymbol: "POL",
            gasFeeAmount: gasFeeAmount
        };

        const response = await fetch(config.API_URLS.TRANSACTION, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
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

// Fungsi untuk melakukan wrapping
const performWrap = async (walletIndex, txCount) => {
    const wallet = new ethers.Wallet(privateKeys[walletIndex], provider);
    const tpolContract = new ethers.Contract(TPOL_ADDRESS, TPOL_ABI, wallet);
    const amount = ethers.parseEther("0.0001"); // 0.0001 WPOL
    const GAS_PRICE = ethers.parseUnits(config.API_URLS.GAS_PRICE, "gwei");

    try {
        console.log(chalk.yellow(`\n[ASC] AUTOSWAP by AirdropASC | Account ${walletIndex + 1}`));
        console.log(chalk.yellow("[ASC] ======================================="));

        // Cek Balance WPOL
        const wpolBalance = await getWPOLBalance(wallet);
        console.log(chalk.cyan(`[ASC] Balance WPOL: ${wpolBalance}`));

        // Cek Balance POL (MATIC)
        const polBalance = await getPOLBalance(wallet);
        console.log(chalk.cyan(`[ASC] Balance POL: ${polBalance}`));

        // Jika Balance WPOL kurang dari 0.0001 atau Balance POL tidak cukup, hentikan bot
        if (parseFloat(wpolBalance) < 0.0001 || parseFloat(polBalance) < 0.001) { // Sesuaikan threshold gas fee
            console.log(chalk.red("[ASC] Balance WPOL atau POL tidak mencukupi. Bot berhenti."));
            return;
        }

        // Wrap Process
        const wrapGasFee = await getGasQuote();
        console.log(chalk.green(`[ASC] Gas Fee: ${wrapGasFee}`));

        const wrapTx = await tpolContract.wrap(
            amount,
            wallet.address,
            {
                gasPrice: GAS_PRICE
            }
        );
        console.log(chalk.green(`[ASC] WPOL to TPOL txid: ${wrapTx.hash}`));

        // Menunggu 5 detik tanpa log
        for (let i = 5; i >= 0; i--) {
            await delay(1000);
            process.stdout.write(`\r${chalk.blue("[ASC] Waiting Confirmation... " + i)} `);
        }

        // Menampilkan pesan "Wrap Sukses"
        console.log("\n" + chalk.green("[ASC] Wrap Sukses!"));

        // Notifikasi API dengan hash transaksi
        await notifyTransaction(wallet.address, wrapTx.hash, wrapGasFee);

    } catch (error) {
        console.error(chalk.red(`[ASC] Wrap process failed:`, error));
    }
};

// Fungsi untuk melakukan check-in dan wrap dalam satu alur
const checkInAndWrap = async (walletIndex, txCount) => {
    const wallet = new ethers.Wallet(privateKeys[walletIndex], provider);

    // Cek status check-in
    const hasCheckedIn = await checkLastCheckInStatus(wallet.address);
    if (!hasCheckedIn) {
//        console.log(chalk.yellow("[ASC] Performing check-in..."));
        await dailyCheckIn(wallet.address);
    }

    // Setelah check-in selesai, lakukan wrapping
//    console.log(chalk.yellow(`[ASC] Proceeding with wrap for account ${walletIndex + 1}`));
    await performWrap(walletIndex, txCount);
};

// Fungsi untuk melakukan looping check-in dan wrap tanpa batas
const loopCheckInAndWrapForever = async () => {
    let txCount = 0; // Counter untuk jumlah transaksi

    while (true) {
        const walletIndex = txCount % privateKeys.length; // Rotasi akun
        txCount++; // Tambah counter setiap iterasi

        // Jalankan proses check-in dan wrap untuk wallet yang sesuai
        await checkInAndWrap(walletIndex, txCount);

        // Animasi hitungan mundur (hanya angka yang berubah)
        for (let i = 5; i >= 0; i--) {
            await delay(1000); // Tunggu 1 detik
            process.stdout.write(`\r${chalk.blue("[ASC] Next Swap in... " + i)} `); // Perbarui angka
        }
        console.log("\n"); // Pindah ke baris baru setelah hitungan selesai
    }
};

// Jalankan loop check-in dan wrap tanpa batas
(async () => {
    await loopCheckInAndWrapForever();
})();
