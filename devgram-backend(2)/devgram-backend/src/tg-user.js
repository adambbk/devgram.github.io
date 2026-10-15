// Compte Telegram "créateur" (MTProto via GramJS). Seul moyen de CRÉER des canaux/groupes automatiquement :
// l'API Bot de Telegram ne le permet pas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { CustomFile } = require('telegram/client/uploads');
const cfg = require('./config');

const client = new TelegramClient(new StringSession(cfg.tg.session), cfg.tg.apiId, cfg.tg.apiHash, { connectionRetries: 5 });
try { client.setLogLevel('error'); } catch { /* ignore */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => BigInt('0x' + crypto.randomBytes(7).toString('hex'));

// Attend et réessaie quand Telegram impose une pause (FLOOD_WAIT), au lieu d'échouer.
async function safe(fn, label) {
  for (let i = 0; i < 4; i++) {
    try { return await fn(); } catch (e) {
      const m = /FLOOD_WAIT_(\d+)/.exec(e.errorMessage || '');
      const sec = e.seconds || (m && Number(m[1]));
      if (sec && sec <= 300) { await sleep((sec + 2) * 1000); continue; }
      throw e;
    }
  }
  throw new Error('Telegram limite trop les requêtes (' + label + ')');
}

async function init() {
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error('Session Telegram invalide : lance « npm run login »');
  await client.getDialogs({ limit: 300 }); // remplit le cache des canaux déjà créés
}

const peer = (id) => client.getInputEntity(Number('-100' + id));

const adminRights = (kind) => new Api.ChatAdminRights({
  changeInfo: true, postMessages: kind === 'channel', editMessages: kind === 'channel', deleteMessages: true,
  banUsers: kind !== 'channel', inviteUsers: true, pinMessages: true, manageCall: true,
  manageTopics: kind === 'forum', addAdmins: false, anonymous: false,
});
const botRights = (kind) => new Api.ChatAdminRights({
  changeInfo: false, postMessages: kind === 'channel', editMessages: kind === 'channel', deleteMessages: true,
  banUsers: kind !== 'channel', inviteUsers: true, pinMessages: true, manageTopics: kind === 'forum',
});

async function resolveUser(username) {
  try {
    const e = await client.getEntity('@' + username);
    return e.className === 'User' && !e.bot ? { id: e.id.toString() } : null;
  } catch (e) {
    if (/USERNAME_NOT_OCCUPIED|USERNAME_INVALID/.test(e.errorMessage || '')) return null;
    throw e;
  }
}

async function createChat({ title, about, kind }) {
  const r = await safe(() => client.invoke(new Api.channels.CreateChannel({
    title, about: about || '', broadcast: kind === 'channel', megagroup: kind !== 'channel',
  })), 'create');
  return { id: r.chats[0].id.toString() };
}
const toggleForum = async (id) => safe(async () => client.invoke(new Api.channels.ToggleForum({ channel: await peer(id), enabled: true, tabs: false })), 'forum');
const setDiscussion = async (broadcastId, groupId) => safe(async () => client.invoke(new Api.channels.SetDiscussionGroup({ broadcast: await peer(broadcastId), group: await peer(groupId) })), 'discussion');

// Essaie le nom voulu, puis le nom de secours. Renvoie le nom obtenu ou null.
async function setUsername(id, candidates) {
  const ch = await peer(id);
  for (const u of candidates.filter(Boolean)) {
    try {
      const free = await safe(() => client.invoke(new Api.channels.CheckUsername({ channel: ch, username: u })), 'check');
      if (!free) continue;
      await safe(() => client.invoke(new Api.channels.UpdateUsername({ channel: ch, username: u })), 'username');
      return u;
    } catch (e) {
      if (/USERNAME_OCCUPIED|USERNAME_INVALID|USERNAME_PURCHASE_AVAILABLE/.test(e.errorMessage || '')) continue;
      throw e;
    }
  }
  return null;
}

async function setPhoto(id, filePath) {
  const ch = await peer(id);
  const size = fs.statSync(filePath).size;
  const file = await client.uploadFile({ file: new CustomFile(path.basename(filePath), size, filePath), workers: 1 });
  await safe(() => client.invoke(new Api.channels.EditPhoto({ channel: ch, photo: new Api.InputChatUploadedPhoto({ file }) })), 'photo');
}

async function createTopics(id, titles) {
  const ch = await peer(id);
  for (const title of titles) {
    await safe(() => client.invoke(new Api.channels.CreateForumTopic({ channel: ch, title, randomId: rnd() })), 'topic');
    await sleep(1200 + Math.random() * 800);
  }
}

const makeBotAdmin = async (id, kind) => safe(async () => client.invoke(new Api.channels.EditAdmin({
  channel: await peer(id), userId: '@' + cfg.bot.username, adminRights: botRights(kind), rank: 'Bot',
})), 'bot-admin');

async function exportInvite(id) {
  const r = await safe(async () => client.invoke(new Api.messages.ExportChatInvite({ peer: await peer(id), title: 'Client' })), 'invite');
  return r.link;
}

// Contrôle automatique : relit le canal réel et compare avec la commande.
async function selfCheck(d, st, hasLogo) {
  const checks = []; const add = (label, ok, detail = '') => checks.push({ label, ok: !!ok, detail });
  const ch = await peer(st.chat.main);
  const r = await safe(() => client.invoke(new Api.channels.GetFullChannel({ channel: ch })), 'fullchannel');
  const chat = r.chats.find((c) => c.id.toString() === st.chat.main) || {};
  const full = r.fullChat || {};
  add('Nom', chat.title === d.name, chat.title);
  add('Description', (full.about || '') === (d.description || ''));
  if (d.visibility === 'public') add('Lien public', (chat.username || '').toLowerCase() === (st.username || '').toLowerCase(), chat.username ? 't.me/' + chat.username : '');
  if (hasLogo) add('Logo', chat.photo && chat.photo.className !== 'ChatPhotoEmpty');
  add('Message épinglé', !!full.pinnedMsgId);
  try {
    const p = await client.invoke(new Api.channels.GetParticipant({ channel: ch, participant: '@' + cfg.bot.username }));
    add('Bot administrateur', p.participant.className === 'ChannelParticipantAdmin');
  } catch { add('Bot administrateur', false); }
  if (d.format === 'forum') {
    try {
      const t = await client.invoke(new Api.channels.GetForumTopics({ channel: ch, offsetDate: 0, offsetId: 0, offsetTopic: 0, limit: 100 }));
      add('Sujets', t.topics.length >= (st.topicsExpected || 1) + 1, `${t.topics.length} sujets`);
    } catch { add('Sujets', false); }
  }
  if (d.linkedGroup) add('Groupe de commentaires', !!full.linkedChatId);
  return checks;
}

// Invitation directe (réussit seulement si la vie privée du client l'autorise) : on ignore l'échec.
async function tryInvite(username, id) {
  try { await client.invoke(new Api.channels.InviteToChannel({ channel: await peer(id), users: ['@' + username] })); return true; } catch { return false; }
}

// Donne les droits d'admin. 'pending' tant que le client n'a pas rejoint le canal.
async function promote(username, id, kind) {
  try {
    await safe(async () => client.invoke(new Api.channels.EditAdmin({ channel: await peer(id), userId: '@' + username, adminRights: adminRights(kind), rank: 'Admin' })), 'promote');
    return 'ok';
  } catch (e) {
    if (/USER_NOT_PARTICIPANT|USER_ID_INVALID/.test(e.errorMessage || '')) return 'pending';
    throw e;
  }
}

const deleteChat = async (id) => safe(async () => client.invoke(new Api.channels.DeleteChannel({ channel: await peer(id) })), 'delete');

module.exports = { client, init, sleep, resolveUser, createChat, toggleForum, setDiscussion, setUsername, setPhoto, createTopics, makeBotAdmin, exportInvite, selfCheck, tryInvite, promote, deleteChat };
