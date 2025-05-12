require('../settings')
const fs = require('fs')
const path = require('path')
const https = require('https')
const axios = require('axios')
const chalk = require('chalk')
const crypto = require('crypto')
const FileType = require('file-type')
const PhoneNumber = require('awesome-phonenumber') 

//constanta module
const { imageToWebp, videoToWebp, writeExif } = require('../database/exif');
const { isUrl, getGroupAdmins, generateMessageTag, getBuffer, getSizeMedia, fetchJson, sleep, getTypeUrlMedia } = require('../database/function')

//constanta baileys
const { jidNormalizedUser, proto, getBinaryNodeChildren, getBinaryNodeChild, generateMessageIDV2, jidEncode, encodeSignedDeviceIdentity, generateWAMessageContent, generateForwardMessageContent, prepareWAMessageMedia, delay, areJidsSameUser, extractMessageContent, generateMessageID, downloadContentFromMessage, generateWAMessageFromContent, jidDecode, generateWAMessage, toBuffer, getContentType, WAMessageStubType, getDevice } = require('baileys') 

async function groupCacheUpdate(raja, update, store, groupCache) {
	try {
		for (let n of update) {
			if (store.groupMetadata[n.id]) {
				groupCache.set(n.id, n)
				store.groupMetadata[n.id] = {
					...(store.groupMetadata[n.id] || {}),
					...(n || {})
				}
			}
		}
	} catch (err) {
		throw err
	}
} 

async function messagesUpsert(raja, message, store, groupCache) {
	try {
		let botNumber = await raja.decodeJid(raja.user.id);
		const msg = message.messages[0];
		if (!store.groupMetadata || Object.keys(store.groupMetadata).length === 0) {
			store.groupMetadata ??= await raja.groupFetchAllParticipating().catch(e => ({}))
		}
		if (!store.messages[msg.key.remoteJid]?.array?.some(a => a.key.id === msg.key.id)) return;
		const type = msg.message ? (getContentType(msg.message) || Object.keys(msg.message)[0]) : '';
		//if (!msg.key.fromMe && !msg.message && message.type === 'notify') return
		const m = await serialize(raja, msg, store, groupCache)
		require('../sukuna')(raja, m, msg, store, groupCache);
		if (type === 'interactiveResponseMessage' && m.quoted && m.quoted.fromMe) {
			await raja.appendResponseMessage(m, JSON.parse(m.msg.nativeFlowResponseMessage.paramsJson).id);
		}
		if (global.db?.set[botNumber] && global.db?.set[botNumber]?.readsw) {
			if (msg.key.remoteJid === 'status@broadcast') {
				await raja.readMessages([msg.key]);
				if (/protocolMessage/i.test(type)) raja.sendFromOwner(global.owner, 'Status dari @' + msg.key.participant.split('@')[0] + ' Telah dihapus', msg, { mentions: [msg.key.participant] });
				if (/(audioMessage|imageMessage|videoMessage|extendedTextMessage)/i.test(type)) {
					let keke = (type == 'extendedTextMessage') ? `Story Teks Berisi : ${msg.message.extendedTextMessage.text ? msg.message.extendedTextMessage.text : ''}` : (type == 'imageMessage') ? `Story Gambar ${msg.message.imageMessage.caption ? 'dengan Caption : ' + msg.message.imageMessage.caption : ''}` : (type == 'videoMessage') ? `Story Video ${msg.message.videoMessage.caption ? 'dengan Caption : ' + msg.message.videoMessage.caption : ''}` : (type == 'audioMessage') ? 'Story Audio' : '\nTidak diketahui cek saja langsung'
					await raja.sendFromOwner(global.owner, `Melihat story dari @${msg.key.participant.split('@')[0]}\n${keke}`, msg, { mentions: [msg.key.participant] });
				}
			}
		}
	} catch (e) {
		throw e;
	}
}

async function solving(raja, store) {
  raja.serializeM = (m) => messagesUpsert(raja, m, store) 
  
  raja.decodeJid = (jid) => {
		if (!jid) return jid
		if (/:\d+@/gi.test(jid)) {
			let decode = jidDecode(jid) || {}
			return decode.user && decode.server && decode.user + '@' + decode.server || jid
		} else return jid
	} 
	
	raja.getName = (jid, withoutContact  = false) => {
		const id = raja.decodeJid(jid)
		if (id.endsWith('@g.us')) {
			const groupInfo = store.contacts[id] || raja.groupMetadata(id) || {}
			return Promise.resolve(groupInfo.name || groupInfo.subject || PhoneNumber('+' + id.replace('@g.us', '')).getNumber('international'))
		} else {
			if (id === '0@s.whatsapp.net') {
				return 'WhatsApp'
			}
		const contactInfo = store.contacts[id] || {}
		return withoutContact ? '' : contactInfo.name || contactInfo.subject || contactInfo.verifiedName || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international')
		}
	} 
	
	raja.sendTextMentions = async (jid, text, quoted, options = {}) => raja.sendMessage(jid, { text: text, mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'), ...options }, { quoted }) 
	
	raja.sendAsSticker = async (jid, path, quoted, options = {}) => {
		const buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
		const result = await writeExif(buff, options)
		return raja.sendMessage(jid, { sticker: { url: result }, ...options }, { quoted, ephemeralExpiration: quoted.expiration || 0 })
	} 
	
	raja.downloadMediaMessage = async (message) => {
		const msg = message.msg || message
		const mime = msg.mimetype || ''
		const messageType = (message.type || mime.split('/')[0]).replace(/Message/gi, '')
		const stream = await downloadContentFromMessage(msg, messageType)
		let buffer = Buffer.from([])
		for await (const chunk of stream) {
			buffer = Buffer.concat([buffer, chunk])
		}
		return buffer
	}
	
	raja.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
		const buffer = await raja.downloadMediaMessage(message)
		const type = await FileType.fromBuffer(buffer)
		const trueFileName = attachExtension ? `./database/sampah/${filename ? filename : Date.now()}.${type.ext}` : filename
		await fs.promises.writeFile(trueFileName, buffer)
		return trueFileName
	} 
  
  if (raja.user && raja.user.id) {
		const botNumber = raja.decodeJid(raja.user.id)
		raja.public = true
	} else raja.public = true
	
  return raja
} 

async function serialize(raja, m, store, groupCache) {
  const botNumber = raja.decodeJid(raja.user.id)
	if (!m) return m
	if (!store.messages[m.key.remoteJid]?.array?.some(a => a.key.id === m.key.id)) return m
	if (m.key) {
		m.id = m.key.id
		m.chat = m.key.remoteJid
		m.fromMe = m.key.fromMe
		m.isBot = ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some(a => m.id.startsWith(a) && [12, 16, 20, 22, 40].includes(m.id.length)) || /(.)\1{5,}|[^a-zA-Z0-9]/.test(m.id) || false
		m.isGroup = m.chat.endsWith('@g.us')
		m.sender = raja.decodeJid(m.fromMe && raja.user.id || m.participant || m.key.participant || m.chat || '')
		if (m.isGroup) {
			if (!store.groupMetadata) store.groupMetadata = await raja.groupFetchAllParticipating().catch(e => ({}))
			let metadata = store.groupMetadata[m.chat] ? store.groupMetadata[m.chat] : (store.groupMetadata[m.chat] = groupCache.get(m.chat))
			if (!metadata) {
				metadata = await raja.groupMetadata(m.chat).catch(e => ({}))
				if (metadata) metadata.participants = metadata.participants?.filter(p => p.hasOwnProperty('id') && p.hasOwnProperty('admin'))?.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i) || []
				if (metadata) groupCache.set(m.chat, metadata)
			}
			if (metadata) metadata.participants = metadata.participants?.filter(p => p.hasOwnProperty('id') && p.hasOwnProperty('admin'))?.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i) || []
			m.metadata = metadata
			m.admins = m.metadata.participants ? (m.metadata.participants.reduce((a, b) => (b.admin ? a.push({ id: b.id, admin: b.admin }) : [...a]) && a, [])) : []
			m.isAdmin = m.admins?.some((b) => b.id === m.sender) || false
			m.participant = m.key.participant
			m.isBotAdmin = !!m.admins?.find((member) => member.id === botNumber) || false
		}
	}
	if (m.message) {
		m.type = getContentType(m.message) || Object.keys(m.message)[0]
		m.msg = (/viewOnceMessage/i.test(m.type) ? m.message[m.type].message[getContentType(m.message[m.type].message)] : (extractMessageContent(m.message[m.type]) || m.message[m.type]))
		m.body = m.message?.conversation || m.msg?.text || m.msg?.conversation || m.msg?.caption || m.msg?.selectedButtonId || m.msg?.singleSelectReply?.selectedRowId || m.msg?.selectedId || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || m.msg?.name || ''
		m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []
		m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || ''
		m.prefix = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi.test(m.body) ? m.body.match(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi)[0] : /[\uD800-\uDBFF][\uDC00-\uDFFF]/gi.test(m.body) ? m.body.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/gi)[0] : ''
		m.command = m.body && m.body.replace(m.prefix, '').trim().split(/ +/).shift()
		m.args = m.body?.trim().replace(new RegExp("^" + m.prefix?.replace(/[.*=+:\-?^${}()|[\]\\]|\s/g, '\\$&'), 'i'), '').replace(m.command, '').split(/ +/).filter(a => a) || []
		m.device = getDevice(m.id)
		m.expiration = m.msg?.contextInfo?.expiration || 0
		m.timestamp = (typeof m.messageTimestamp === "number" ? m.messageTimestamp : m.messageTimestamp.low ? m.messageTimestamp.low : m.messageTimestamp.high) || m.msg.timestampMs * 1000
		m.isMedia = !!m.msg?.mimetype || !!m.msg?.thumbnailDirectPath
		if (m.isMedia) {
			m.mime = m.msg?.mimetype
			m.size = m.msg?.fileLength
			m.height = m.msg?.height || ''
			m.width = m.msg?.width || ''
			if (/webp/i.test(m.mime)) {
				m.isAnimated = m.msg?.isAnimated
			}
		}
		m.quoted = m.msg?.contextInfo?.quotedMessage || null
		if (m.quoted) {
			m.quoted.message = extractMessageContent(m.msg?.contextInfo?.quotedMessage)
			m.quoted.type = getContentType(m.quoted.message) || Object.keys(m.quoted.message)[0]
			m.quoted.id = m.msg.contextInfo.stanzaId
			m.quoted.device = getDevice(m.quoted.id)
			m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
			m.quoted.isBot = m.quoted.id ? ['HSK', 'BAE', 'B1E', '3EB0', 'B24E', 'WA'].some(a => m.quoted.id.startsWith(a) && [12, 16, 20, 22, 40].includes(m.quoted.id.length)) || /(.)\1{6,}|[^a-zA-Z0-9]/.test(m.quoted.id) : false
			m.quoted.sender = raja.decodeJid(m.msg.contextInfo.participant)
			m.quoted.fromMe = m.quoted.sender === raja.decodeJid(raja.user.id)
			m.quoted.text = m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
			m.quoted.msg = extractMessageContent(m.quoted.message[m.quoted.type]) || m.quoted.message[m.quoted.type]
			m.quoted.mentionedJid = m.quoted?.msg?.contextInfo?.mentionedJid || []
			m.quoted.body = m.quoted.msg?.text || m.quoted.msg?.caption || m.quoted?.message?.conversation || m.quoted.msg?.selectedButtonId || m.quoted.msg?.singleSelectReply?.selectedRowId || m.quoted.msg?.selectedId || m.quoted.msg?.contentText || m.quoted.msg?.selectedDisplayText || m.quoted.msg?.title || m.quoted?.msg?.name || ''
			m.getQuotedObj = async () => {
				if (!m.quoted.id) return false
				let q = await store.loadMessage(m.chat, m.quoted.id, raja)
				return await serialize(raja, q, store, groupCache)
			}
			m.quoted.key = {
				remoteJid: m.msg?.contextInfo?.remoteJid || m.chat,
				participant: m.quoted.sender,
				fromMe: areJidsSameUser(raja.decodeJid(m.msg?.contextInfo?.participant), raja.decodeJid(raja?.user?.id)),
				id: m.msg?.contextInfo?.stanzaId
			}
			m.quoted.isGroup = m.quoted.chat.endsWith('@g.us')
			m.quoted.mentions = m.quoted.msg?.contextInfo?.mentionedJid || []
			m.quoted.body = m.quoted.msg?.text || m.quoted.msg?.caption || m.quoted?.message?.conversation || m.quoted.msg?.selectedButtonId || m.quoted.msg?.singleSelectReply?.selectedRowId || m.quoted.msg?.selectedId || m.quoted.msg?.contentText || m.quoted.msg?.selectedDisplayText || m.quoted.msg?.title || m.quoted?.msg?.name || ''
			m.quoted.prefix = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi.test(m.quoted.body) ? m.quoted.body.match(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi)[0] : /[\uD800-\uDBFF][\uDC00-\uDFFF]/gi.test(m.quoted.body) ? m.quoted.body.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/gi)[0] : ''
			m.quoted.command = m.quoted.body && m.quoted.body.replace(m.quoted.prefix, '').trim().split(/ +/).shift()
			m.quoted.isMedia = !!m.quoted.msg?.mimetype || !!m.quoted.msg?.thumbnailDirectPath
			if (m.quoted.isMedia) {
				m.quoted.mime = m.quoted.msg?.mimetype
				m.quoted.size = m.quoted.msg?.fileLength
				m.quoted.height = m.quoted.msg?.height || ''
				m.quoted.width = m.quoted.msg?.width || ''
				if (/webp/i.test(m.quoted.mime)) {
					m.quoted.isAnimated = m?.quoted?.msg?.isAnimated || false
				}
			}
			m.quoted.fakeObj = proto.WebMessageInfo.fromObject({
				key: {
					remoteJid: m.quoted.chat,
					fromMe: m.quoted.fromMe,
					id: m.quoted.id
				},
				message: m.quoted,
				...(m.isGroup ? { participant: m.quoted.sender } : {})
			})
			m.quoted.download = () => raja.downloadMediaMessage(m.quoted)
			m.quoted.delete = () => {
				raja.sendMessage(m.quoted.chat, {
					delete: {
						remoteJid: m.quoted.chat,
						fromMe: m.isBotAdmins ? false : true,
						id: m.quoted.id,
						participant: m.quoted.sender
					}
				})
			}
		}
	}
	
	m.download = () => raja.downloadMediaMessage(m)
	
	m.copy = () => serialize(raja, proto.WebMessageInfo.fromObject(proto.WebMessageInfo.toObject(m)))
	
	m.reply = async (content, options = {}) => {
		const { quoted = m, chat = m.chat, caption = '', ephemeralExpiration = m.expiration, mentions = (typeof content === 'string' || typeof content.text === 'string' || typeof content.caption === 'string') ? [...(content.text || content.caption || content).matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net') : [], ...validate } = options
		if (typeof content === 'object') {
			return raja.sendMessage(chat, content, { ...options, quoted, ephemeralExpiration })
		} else if (typeof content === 'string') {
			try {
				if (/^https?:\/\//.test(content)) {
					const data = await axios.get(content, { responseType: 'arraybuffer' })
					const mime = data.headers['content-type'] || (await FileType.fromBuffer(data.data)).mime
					if (/gif|image|video|audio|pdf|stream/i.test(mime)) {
						return raja.sendMedia(chat, data.data, '', caption, quoted, content)
					} else {
						return raja.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration })
					}
				} else {
					return raja.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration })
				}
			} catch (e) {
				return raja.sendMessage(chat, { text: content, mentions, ...options }, { quoted, ephemeralExpiration })
			}
		}
	}

	return m
} 

module.exports = { groupCacheUpdate, messagesUpsert, solving } 

let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update ${__filename}`))
	delete require.cache[file]
	require(file)
})