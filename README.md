<p align="center">
  <img height="300" height="auto" src="https://github.com/sipalingnode/sipalingnode/blob/main/logo.png">
</p>

<h2 align="center"><b>Community Team</b></h2>
<p align="center">
  <a href="https://www.airdropasc.com" target="_blank"><img src="https://github.com/sipalingnode/sipalingnode/blob/main/logo.png" width="50"/></a>&nbsp;&nbsp;&nbsp;
  <a href="https://t.me/airdropasc" target="_blank"><img src="https://github.com/user-attachments/assets/56e7f6ee-18b7-4b36-becc-ec6e4de7bff9" width="50"/></a>&nbsp;&nbsp;&nbsp;
  <a href="https://x.com/Autosultan_team" target="_blank"><img src="https://github.com/user-attachments/assets/fbb43aa4-9652-4a49-b984-5cf032b6b1ac" width="50"/></a>&nbsp;&nbsp;&nbsp;
  <a href="https://www.youtube.com/@ZamzaSalim" target="_blank"><img src="https://github.com/user-attachments/assets/c15509f9-acb7-49ce-989a-5bac62e7e549" width="50"/></a>
</p>

---

# AUTO SWAP WPOL TO TPOL TEAFI
| **Fitur Bot** |
|---------|
| Swap WPOL to TPOL  |
| Multi Account  |
| Proxy Support  |
| Daily Check-in   |

---

## Pastikan kalian sudah install [Nodejs](https://deb.nodesource.com/)
## Proxy (if you want)
- Register : [Here](https://app.proxy-cheap.com/r/DPyGQ5)
- Signup with email
- Topup with paypal or another
- Buy Proxy type **Rotating Residential**
- Done
## Join Airdrop
- Register : [Here](https://app.tea-fi.com/?ref=bamxew)
- Swap POL to WPOL
- Swap WPOL to TPOL
- Done

## Running Bot
- Install Screen
  ```
  sudo apt-get install screen
  sudo ufw allow ssh
  ufw enable
  ```
- Clone Repositori & Install Depenci
  ```
  git clone https://github.com/sipalingnode/teafibot.git
  cd teafibot
  ```
  ```
  npm install
  ```
- Submit Privatekey
  ```
  nano .env
  ```
- Submit Proxy (if you want run with proxy)
  ```
  nano proxy.txt
  ```
- Buat Screen
  ```
  screen -S teafibot
  ```
- Run Bot (no proxy)
  ```
  node multi.js
  ```
- Run Bot (with proxy)
  ```
  node proxy.js
  ```
Jika sudah jalan ketik `CTRL+AD`

## Perintah Berguna
- Kembali ke screen : `screen -rd teafibot`
- Cek daftar screen : `screen -ls`
- Hapus screen : `screen -S namascrenn -X quit`
- Update bot : `cd teafibot && git pull`
