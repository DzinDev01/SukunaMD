const fs = require("fs") 
const chalk = require("chalk") 

//global setting
global.owner = ['6283862849801'] 
global.author = 'RAJA' 
global.packname = '© 2025' 
global.listprefix = ['#','.'] 
global.tempatDB = 'database.json' 
global.pairing_code = true 

global.mess = {
  error: `*Terdapat kesalahan, harap coba lagi secara berkala*`, 
  wait: `*Sedang di proses, harap bersabar*`, 
  sukses: `*Berhasil*`, 
  admin: `*Fitur ini khusus admin*`, 
  botAdmin: `*Bot harus menjadi admin terlebih dahulu*`, 
  owner: `*Fitur ini khusus owner*`, 
  group: `*Fitur ini khusus group*`, 
  private: `*Fitur ini khusus private chat*`, 
  premium: `*Fitur ini khusus premium, silahkan ketik #owner untuk membeli premium*`, 
  limit: `*Limit anda telah habis*`
}