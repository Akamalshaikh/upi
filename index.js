require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Load data
let users = JSON.parse(fs.readFileSync('./data/users.json')).users;
let channels = JSON.parse(fs.readFileSync('./data/channels.json')).channels;
let admins = JSON.parse(fs.readFileSync('./data/admins.json')).admins;

// Save data function
const saveData = () => {
  fs.writeFileSync('./data/users.json', JSON.stringify({ users }, null, 2));
  fs.writeFileSync('./data/channels.json', JSON.stringify({ channels }, null, 2));
  fs.writeFileSync('./data/admins.json', JSON.stringify({ admins }, null, 2));
};

// Check if user is admin
const isAdmin = (userId) => admins.includes(userId.toString());

// Check channel membership
const checkMembership = async (userId) => {
  for (const channel of channels) {
    try {
      const member = await bot.getChatMember(channel.id, userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return false;
      }
    } catch (err) {
      return false;
    }
  }
  return true;
};

// Generate join keyboard
const getJoinKeyboard = () => {
  const keyboard = channels.map(channel => [{
    text: '🔗 Join Channel',
    url: channel.link
  }]);
  keyboard.push([{ text: '✅ Joined', callback_data: 'check_join' }]);
  return { inline_keyboard: keyboard };
};

// Main menu keyboard
const getMainMenuKeyboard = (userId) => {
  return {
    inline_keyboard: [
      [{ text: '🔗 Referral Link', callback_data: 'referral_link' }],
      [{ text: '👥 My Invites', callback_data: 'my_invites' }],
      [{ text: '💰 Withdraw', callback_data: 'withdraw' }]
    ]
  };
};

// Start command
bot.onText(/\/start(?:\s+(\d+))?/, async (msg, match) => {
  const userId = msg.from.id;
  const referrerId = match ? match[1] : null;

  if (!users[userId]) {
    users[userId] = {
      referrals: [],
      balance: 0,
      hasWithdrawn: false,
      referredBy: referrerId
    };

    // Credit referrer if exists
    if (referrerId && referrerId !== userId.toString() && users[referrerId]) {
      users[referrerId].referrals.push(userId);
      users[referrerId].balance += process.env.PER_REFER_AMOUNT;
      saveData();
      
      // Notify referrer
      bot.sendMessage(referrerId, `🎉 New referral joined! Earned ${process.env.PER_REFER_AMOUNT} INR`);
    }
    saveData();
  }

  const welcomeMessage = '👋 Hey There User Welcome To Bot!\n\n⭕ Must Join All Channels To Use The Bot';
  await bot.sendMessage(userId, welcomeMessage, {
    reply_markup: getJoinKeyboard()
  });
});

// Check join button callback
bot.on('callback_query', async (query) => {
  const userId = query.from.id;

  if (query.data === 'check_join') {
    const hasJoined = await checkMembership(userId);
    if (hasJoined) {
      const mainMenu = `🎯 Welcome to the main menu!\n\n💰 Per Refer: ${process.env.PER_REFER_AMOUNT} INR\n🎯 Minimum Withdraw: ${process.env.MIN_WITHDRAW} INR`;
      await bot.editMessageText(mainMenu, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: getMainMenuKeyboard(userId)
      });
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: '❌ Please join all channels first!',
        show_alert: true
      });
    }
  } else if (query.data === 'referral_link') {
    try {
      const botInfo = await bot.getMe();
      const referralLink = `https://t.me/${botInfo.username}?start=${userId}`;
      await bot.sendMessage(userId, `🔗 Your Referral Link: ${referralLink}\n\nShare With Your Friend's & Family And Earn Refer Bonus Easily`);
    } catch (error) {
      console.error('Error generating referral link:', error);
      await bot.sendMessage(userId, '❌ Sorry, there was an error generating your referral link. Please try again later.');
    }
  } else if (query.data === 'my_invites') {
    const user = users[userId] || { referrals: [], balance: 0 };
    const invitesMessage = `👥 Total Referrals: ${user.referrals.length}\n💰 Balance: ${user.balance} INR`;
    await bot.sendMessage(userId, invitesMessage);
  } else if (query.data === 'withdraw') {
    const user = users[userId];
    if (user.hasWithdrawn) {
      await bot.sendMessage(userId, '❌ Your withdrawal limit is over.');
      return;
    }
    if (user.balance >= process.env.MIN_WITHDRAW) {
      await bot.sendMessage(userId, '📲 Please DM @Its_soloy for withdrawal.');
      user.hasWithdrawn = true;
      saveData();
    } else {
      await bot.sendMessage(userId, `❌ Minimum withdrawal amount is ${process.env.MIN_WITHDRAW} INR`);
    }
  }
});

// Admin commands
bot.onText(/\/adminpanel/, async (msg) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;

  const adminMenu = `🔧 Admin Panel\n\nCommands:\n/addchannel [channelId] [link]\n/deletechannel [channelId]\n/addadmin [userId]\n/broadcast [message]`;
  await bot.sendMessage(userId, adminMenu);
});

bot.onText(/\/addchannel (.+) (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;

  const channelId = match[1];
  const link = match[2];
  channels.push({ id: channelId, link });
  saveData();
  await bot.sendMessage(userId, '✅ Channel added successfully!');
});

bot.onText(/\/deletechannel (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;

  const channelId = match[1];
  channels = channels.filter(channel => channel.id !== channelId);
  saveData();
  await bot.sendMessage(userId, '✅ Channel deleted successfully!');
});

bot.onText(/\/addadmin (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;

  const newAdminId = match[1];
  if (!admins.includes(newAdminId)) {
    admins.push(newAdminId);
    saveData();
    await bot.sendMessage(userId, '✅ Admin added successfully!');
  }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!isAdmin(userId)) return;

  const message = match[1];
  for (const userId of Object.keys(users)) {
    try {
      await bot.sendMessage(userId, message);
    } catch (err) {
      console.log(`Failed to send broadcast to ${userId}`);
    }
  }
  await bot.sendMessage(msg.chat.id, '✅ Broadcast completed!');
});

console.log('Bot started successfully!');