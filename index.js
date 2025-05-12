require('./settings')
const fs = require('fs')
const pino = require('pino')
const path = require('path')
const axios = require('axios')
const chalk = require('chalk')
const express = require('express')
const readline = require('readline')
const { createServer } = require('http')
const { Boom } = require('@hapi/boom')
const NodeCache = require('node-cache')
const { toBuffer, toDataURL } = require('qrcode')
const { exec, spawn, execSync } = require('child_process')
const { parsePhoneNumber } = require('awesome-phonenumber') 

//contanta baileys
const { default: WAConnection, useMultiFileAuthState, Browsers, DisconnectReason, makeInMemoryStore, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, proto, getAggregateVotesInPollMessage } = require('baileys') 

//constanta pairingCode
const pairingCode = process.argv.includes('--qr') ? false : process.argv.includes('--pairing-code') || global.pairing_code
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve)) 
let pairingStarted = false

//constanta database
const DataBase = require('./src/database')
const database = new DataBase(global.tempatDB) 
const msgRetryCounterCache = new NodeCache()
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false }) 

//constanta keperluan
const { groupCacheUpdate, messagesUpsert, solving } = require('./src/message') 
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, sleep } = require('./database/function')

async function startRajaBot() {
  const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
	const { state, saveCreds } = await useMultiFileAuthState('./database/session')
	const { version, isLatest } = await fetchLatestBaileysVersion()
	const level = pino({ level: 'silent' }) 
	
	const getMessage = async (key) => {
		if (store) {
			const msg = await store.loadMessage(key.remoteJid, key.id);
			return msg?.message || ''
		}
		return {
			conversation: 'Halo Saya Raja Bot'
		}
	} 
	
	const raja = WAConnection({ 
	  logger: level,
		getMessage,
		syncFullHistory: true,
		maxMsgRetryCount: 15,
		msgRetryCounterCache,
		retryRequestDelayMs: 10,
		connectTimeoutMs: 60000,
		printQRInTerminal: !pairingCode,
		defaultQueryTimeoutMs: undefined,
		browser: Browsers.ubuntu('Chrome'),
		generateHighQualityLinkPreview: true,
		cachedGroupMetadata: async (jid) => groupCache.get(jid), 
		transactionOpts: {
			maxCommitRetries: 10,
			delayBetweenTriesMs: 10,
		},
		appStateMacVerification: {
			patch: true,
			snapshot: true,
		},
		auth: {
			creds: state.creds,
			keys: makeCacheableSignalKeyStore(state.keys, level),
		},
	}) 
	
	store.bind(raja.ev) 
	await solving(raja, store) 
	raja.ev.on('creds.update', saveCreds) 
	
	if (pairingCode && !raja.authState.creds.registered && !pairingStarted) {
			pairingStarted = true;
			let phoneNumber;
			async function getPhoneNumber() {
				phoneNumber = await question('Masukan nomor WhatsApp bot kamu : ');
				phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
				
				if (!parsePhoneNumber(phoneNumber).valid && phoneNumber.length < 6) {
					console.log(chalk.bgBlack(chalk.redBright('Mulai dengan code') + chalk.whiteBright(',') + chalk.greenBright(' Contoh : 62xxx')));
					await getPhoneNumber()
				}
			}
			
			setTimeout(async () => {
				await getPhoneNumber()
				await exec('rm -rf ./session/*')
				console.log('Sedang request permintaan pairing...')
				await new Promise(resolve => setTimeout(resolve, 5000));
				let code = await raja.requestPairingCode(phoneNumber);
				console.log(`Kode pairing kamu : ${code}`);
			}, 3000)
		} 
		
		raja.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update 
    if (connection === 'close') {
      startRajaBot()
    } else if (connection === 'open') {
      console.log(`Berhasil terhubung`)
    }
  }) 
	
	raja.ev.on('contacts.update', (update) => {
		for (let contact of update) {
			let id = raja.decodeJid(contact.id)
			if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
		}
	}) 
	
	raja.ev.on('messages.upsert', async (message) => {
		await messagesUpsert(raja, message, store, groupCache);
	});
	
	return raja
} 

startRajaBot() 