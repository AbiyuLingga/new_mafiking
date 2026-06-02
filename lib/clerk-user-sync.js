const { clerkClient } = require('@clerk/express');

function pickClerkEmail(clerkUser) {
  const primaryId = clerkUser && (clerkUser.primaryEmailAddressId || clerkUser.primary_email_address_id);
  const emails = Array.isArray(clerkUser && (clerkUser.emailAddresses || clerkUser.email_addresses))
    ? (clerkUser.emailAddresses || clerkUser.email_addresses)
    : [];
  const primary = emails.find((entry) => entry.id === primaryId) || emails[0];
  return String((primary && (primary.emailAddress || primary.email_address)) || '').trim().toLowerCase();
}

function pickClerkDisplayName(clerkUser, email, clerkId) {
  const first = clerkUser && (clerkUser.firstName || clerkUser.first_name);
  const last = clerkUser && (clerkUser.lastName || clerkUser.last_name);
  const fullName = [first, last].filter(Boolean).join(' ').trim();
  return String((clerkUser && (clerkUser.fullName || clerkUser.full_name || fullName || clerkUser.username)) || email || clerkId).trim();
}

function findUserByClerkId(db, clerkId) {
  return db.prepare('SELECT id, username, display_name, role, clerk_id, email, auth_provider FROM users WHERE clerk_id = ?').get(clerkId);
}

function readUser(db, userId) {
  return db.prepare(`
    SELECT id, username, display_name, fakultas, phone_number, semester, jurusan, mapel_prioritas, referral_source, onboarding_completed_at, role, xp, level, badge_tier, streak_days, highest_streak, last_active, email, auth_provider
    FROM users
    WHERE id = ?
  `).get(userId);
}

function nextAvailableUsername(db, baseUsername) {
  let username = baseUsername;
  let suffix = 1;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    suffix += 1;
    username = `${baseUsername}_${suffix}`;
  }
  return username;
}

function upsertClerkUser(db, { clerkId, email = '', displayName = '', linkByEmail = true } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedDisplay = String(displayName || normalizedEmail || clerkId || '').trim();
  if (!clerkId) throw new Error('clerkId wajib ada');

  const existing = findUserByClerkId(db, clerkId);
  if (existing) return { user: existing, created: false, linked: false, suggestedDisplayName: normalizedDisplay };

  if (linkByEmail && normalizedEmail) {
    const linkedByEmail = db.prepare(`
      SELECT id, username, display_name, role, password_hash, auth_provider
      FROM users
      WHERE lower(username) = lower(?) OR lower(email) = lower(?)
      ORDER BY CASE WHEN password_hash = 'none' THEN 1 ELSE 0 END, id
      LIMIT 1
    `).get(normalizedEmail, normalizedEmail);

    if (linkedByEmail) {
      const provider = linkedByEmail.password_hash === 'none' ? 'clerk' : 'linked';
      db.prepare(`
        UPDATE users
        SET clerk_id = ?, email = COALESCE(NULLIF(email, ''), ?), auth_provider = ?
        WHERE id = ?
      `).run(clerkId, normalizedEmail, provider, linkedByEmail.id);
      return {
        user: findUserByClerkId(db, clerkId),
        created: false,
        linked: true,
        suggestedDisplayName: normalizedDisplay,
      };
    }
  }

  const username = nextAvailableUsername(db, normalizedEmail || `clerk_${clerkId}`);
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, role, clerk_id, email, auth_provider)
    VALUES (?, 'none', ?, 'user', ?, ?, 'clerk')
  `).run(username, normalizedDisplay, clerkId, normalizedEmail);

  return {
    user: readUser(db, Number(info.lastInsertRowid)),
    created: true,
    linked: false,
    suggestedDisplayName: normalizedDisplay,
  };
}

async function syncClerkUserFromId(db, clerkId) {
  const existing = findUserByClerkId(db, clerkId);
  if (existing) return { user: existing, created: false, linked: false, suggestedDisplayName: existing.display_name };

  const clerkUser = await clerkClient.users.getUser(clerkId);
  const email = pickClerkEmail(clerkUser);
  const displayName = pickClerkDisplayName(clerkUser, email, clerkId);
  return upsertClerkUser(db, { clerkId, email, displayName });
}

function mergeUserProgress(db, guestUserId, targetUserId) {
  const guestRows = db.prepare('SELECT * FROM user_progress WHERE user_id = ?').all(guestUserId);
  const targetByProblem = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND problem_id = ?');
  const updateTarget = db.prepare(`
    UPDATE user_progress
    SET solved = ?, attempts = ?, hints_used = ?, xp_earned = ?, solved_at = COALESCE(?, solved_at)
    WHERE id = ?
  `);
  const moveGuest = db.prepare('UPDATE user_progress SET user_id = ? WHERE id = ?');
  const deleteGuest = db.prepare('DELETE FROM user_progress WHERE id = ?');

  for (const row of guestRows) {
    const target = targetByProblem.get(targetUserId, row.problem_id);
    if (!target) {
      moveGuest.run(targetUserId, row.id);
      continue;
    }
    updateTarget.run(
      Math.max(Number(target.solved || 0), Number(row.solved || 0)),
      Number(target.attempts || 0) + Number(row.attempts || 0),
      Number(target.hints_used || 0) + Number(row.hints_used || 0),
      Math.max(Number(target.xp_earned || 0), Number(row.xp_earned || 0)),
      row.solved_at || target.solved_at,
      target.id
    );
    deleteGuest.run(row.id);
  }
}

function moveRowsIfTableExists(db, table, guestUserId, targetUserId) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
  if (!exists) return;
  db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).run(targetUserId, guestUserId);
}

function mergePrimaryUserRow(db, guestUserId, targetUserId) {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
  const guest = db.prepare('SELECT * FROM users WHERE id = ?').get(guestUserId);
  if (!target || !guest) return;

  db.prepare(`
    UPDATE users
    SET xp = ?, level = ?, streak_days = ?, highest_streak = ?, badge_tier = ?, last_active = COALESCE(last_active, ?)
    WHERE id = ?
  `).run(
    Math.max(Number(target.xp || 0), Number(guest.xp || 0)),
    Math.max(Number(target.level || 1), Number(guest.level || 1)),
    Math.max(Number(target.streak_days || 0), Number(guest.streak_days || 0)),
    Math.max(Number(target.highest_streak || 0), Number(guest.highest_streak || 0)),
    Math.max(Number(target.badge_tier || 0), Number(guest.badge_tier || 0)),
    guest.last_active || null,
    targetUserId
  );
}

function mergeProfileRefresh(db, guestUserId, targetUserId) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'profile_ai_refreshes'").get();
  if (!exists) return;
  const target = db.prepare('SELECT user_id FROM profile_ai_refreshes WHERE user_id = ?').get(targetUserId);
  if (target) {
    db.prepare('DELETE FROM profile_ai_refreshes WHERE user_id = ?').run(guestUserId);
  } else {
    db.prepare('UPDATE profile_ai_refreshes SET user_id = ? WHERE user_id = ?').run(targetUserId, guestUserId);
  }
}

function mergeGuestIntoUser(db, guestUserId, targetUserId) {
  if (!guestUserId || !targetUserId || Number(guestUserId) === Number(targetUserId)) return false;

  const merge = db.transaction(() => {
    const guest = db.prepare("SELECT id FROM users WHERE id = ? AND password_hash = 'none'").get(guestUserId);
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!guest || !target) return false;

    mergePrimaryUserRow(db, guestUserId, targetUserId);
    mergeUserProgress(db, guestUserId, targetUserId);
    for (const table of ['payments', 'correction_attempts', 'practice_attempts', 'user_access_grants']) {
      moveRowsIfTableExists(db, table, guestUserId, targetUserId);
    }
    mergeProfileRefresh(db, guestUserId, targetUserId);
    db.prepare('DELETE FROM users WHERE id = ?').run(guestUserId);
    return true;
  });

  return merge();
}

module.exports = {
  mergeGuestIntoUser,
  pickClerkDisplayName,
  pickClerkEmail,
  readUser,
  syncClerkUserFromId,
  upsertClerkUser,
};
