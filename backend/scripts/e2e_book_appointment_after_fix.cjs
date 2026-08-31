// E2E test runner for book_appointment after Redis cache validation patch
const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');
const { google } = require('googleapis');
const fs = require('node:fs');

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

const BUSINESS_SUCCESS = {
  id: 'cmrse5mne0000nu9pjezqw2a0',
  assistantId: 'be96aea9-e57f-4551-819f-ad945e390da8',
};
const BUSINESS_INVALID = {
  id: 'cmrt5y31u0000nueesv2zfokl',
  assistantId: '8825b0d1-ca2f-447e-88af-f65896c1bea9',
};
const BUSINESS_DISCONNECTED = {
  id: 'cmrsejtil0025nu9pgna0c7zj',
  assistantId: '8534d4ab-1b06-4d46-acd7-a7b07b9b730c',
};

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function buildPayload({ assistantId, callId, clientName, clientEmail, startDateTime, durationMinutes }) {
  return {
    message: {
      type: 'function-call',
      toolUse: {
        type: 'function',
        function: {
          name: 'book_appointment',
          parameters: {
            clientName,
            clientEmail,
            startDateTime,
            durationMinutes,
          },
        },
      },
    },
    call: { id: callId },
    assistant: { id: assistantId },
    timestamp: new Date().toISOString(),
  };
}

async function callWebhook(payload) {
  const response = await fetch('http://127.0.0.1:3000/webhooks/vapi', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

async function getBusinessSnapshot(id) {
  return prisma.business.findUnique({
    where: { id },
    select: {
      id: true,
      googleRefreshToken: true,
      googleCalendarId: true,
      googleCalendarConnected: true,
      googleCalendarDisconnectedAt: true,
      googleCalendarLastError: true,
    },
  });
}

async function restoreBusiness(snapshot) {
  await prisma.business.update({
    where: { id: snapshot.id },
    data: {
      googleRefreshToken: snapshot.googleRefreshToken,
      googleCalendarId: snapshot.googleCalendarId,
      googleCalendarConnected: snapshot.googleCalendarConnected,
      googleCalendarDisconnectedAt: snapshot.googleCalendarDisconnectedAt,
      googleCalendarLastError: snapshot.googleCalendarLastError,
    },
  });
}

async function listMatchingEvents({ refreshToken, calendarId = 'primary', summary, startDateTime }) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const start = new Date(startDateTime);
  const timeMin = new Date(start.getTime() - 5 * 60 * 1000).toISOString();
  const timeMax = new Date(start.getTime() + 60 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      q: summary,
      maxResults: 20,
    });
    const items = (response.data.items || []).filter((item) => {
      const itemStart = item.start?.dateTime || item.start?.date;
      return item.summary === summary && itemStart === startDateTime;
    });
    if (items.length > 0) return items;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return [];
}

async function deleteEvents({ refreshToken, calendarId = 'primary', eventIds = [] }) {
  if (!eventIds.length) return;
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  for (const eventId of eventIds) {
    try { await calendar.events.delete({ calendarId, eventId }); } catch {}
  }
}

(async function run(){
  const output = { scenario1: null, scenario2: null, scenario3: null, cleanup: [] };
  const originalSuccess = await getBusinessSnapshot(BUSINESS_SUCCESS.id);
  const originalInvalid = await getBusinessSnapshot(BUSINESS_INVALID.id);
  const originalDisconnected = await getBusinessSnapshot(BUSINESS_DISCONNECTED.id);

  try {
    // Scenario 1
    const successRedisKey = `vapi_config:${BUSINESS_SUCCESS.assistantId}`;
    const successStart = '2026-07-29T12:00:00.000Z';
    const successSummary = 'Reserva de E2E Success After Fix';

    await prisma.business.update({
      where: { id: BUSINESS_SUCCESS.id },
      data: {
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
        googleCalendarId: 'primary',
      },
    });

    await redis.set(successRedisKey, JSON.stringify({
      businessId: BUSINESS_SUCCESS.id,
      googleRefreshToken: null,
      googleCalendarId: 'primary',
      googleCalendarConnected: false,
    }), 'EX', 3600);

    const scenario1Response = await callWebhook(buildPayload({
      assistantId: BUSINESS_SUCCESS.assistantId,
      callId: 'e2e-success-after-fix-001',
      clientName: 'E2E Success After Fix',
      clientEmail: 'e2e-success-after-fix@example.com',
      startDateTime: successStart,
      durationMinutes: 30,
    }));

    const successEvents = await listMatchingEvents({
      refreshToken: originalSuccess.googleRefreshToken,
      calendarId: 'primary',
      summary: successSummary,
      startDateTime: successStart,
    });

    output.scenario1 = {
      httpStatus: scenario1Response.status,
      response: scenario1Response.body,
      createdEventCount: successEvents.length,
      createdEventIds: successEvents.map((e) => e.id),
      passed: scenario1Response.status === 200 && scenario1Response.body?.result?.success === true && successEvents.length > 0,
    };

    await deleteEvents({ refreshToken: originalSuccess.googleRefreshToken, calendarId: 'primary', eventIds: successEvents.map((e) => e.id).filter(Boolean) });
    await redis.del(successRedisKey);
    await restoreBusiness(originalSuccess);
    output.cleanup.push('scenario1 cleaned');

    // Scenario 2 - invalid_grant
    const invalidRedisKey = `vapi_config:${BUSINESS_INVALID.assistantId}`;
    await prisma.business.update({
      where: { id: BUSINESS_INVALID.id },
      data: {
        googleRefreshToken: 'invalid-refresh-token-for-e2e',
        googleCalendarId: 'primary',
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });
    await redis.set(invalidRedisKey, JSON.stringify({
      businessId: BUSINESS_INVALID.id,
      googleRefreshToken: 'invalid-refresh-token-for-e2e',
      googleCalendarId: 'primary',
      googleCalendarConnected: true,
    }), 'EX', 3600);

    const scenario2Response = await callWebhook(buildPayload({
      assistantId: BUSINESS_INVALID.assistantId,
      callId: 'e2e-invalid-after-fix-001',
      clientName: 'E2E Invalid After Fix',
      clientEmail: 'e2e-invalid-after-fix@example.com',
      startDateTime: '2026-07-29T12:30:00.000Z',
      durationMinutes: 30,
    }));

    const invalidBusiness = await getBusinessSnapshot(BUSINESS_INVALID.id);
    const invalidRedisExists = await redis.exists(invalidRedisKey);

    output.scenario2 = {
      httpStatus: scenario2Response.status,
      response: scenario2Response.body,
      businessState: {
        googleCalendarConnected: invalidBusiness.googleCalendarConnected,
        googleRefreshTokenIsNull: invalidBusiness.googleRefreshToken === null,
        googleCalendarDisconnectedAt: invalidBusiness.googleCalendarDisconnectedAt,
        googleCalendarLastError: invalidBusiness.googleCalendarLastError,
      },
      redisKeyDeleted: invalidRedisExists === 0,
      passed:
        scenario2Response.status === 200 &&
        scenario2Response.body?.result?.success === false &&
        scenario2Response.body?.result?.code === 'GOOGLE_CALENDAR_RECONNECT_REQUIRED' &&
        invalidBusiness.googleCalendarConnected === false &&
        invalidBusiness.googleRefreshToken === null &&
        !!invalidBusiness.googleCalendarDisconnectedAt &&
        invalidBusiness.googleCalendarLastError === 'invalid_grant' &&
        invalidRedisExists === 0,
    };

    await restoreBusiness(originalInvalid);
    await redis.del(invalidRedisKey);
    output.cleanup.push('scenario2 cleaned');

    // Scenario 3 - disconnected
    const disconnectedRedisKey = `vapi_config:${BUSINESS_DISCONNECTED.assistantId}`;
    await prisma.business.update({
      where: { id: BUSINESS_DISCONNECTED.id },
      data: {
        googleRefreshToken: null,
        googleCalendarId: null,
        googleCalendarConnected: false,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });

    await redis.set(disconnectedRedisKey, JSON.stringify({
      businessId: BUSINESS_DISCONNECTED.id,
      googleRefreshToken: null,
      googleCalendarId: null,
      googleCalendarConnected: false,
    }), 'EX', 3600);

    const scenario3Response = await callWebhook(buildPayload({
      assistantId: BUSINESS_DISCONNECTED.assistantId,
      callId: 'e2e-disconnected-after-fix-001',
      clientName: 'E2E Disconnected After Fix',
      clientEmail: 'e2e-disconnected-after-fix@example.com',
      startDateTime: '2026-07-29T13:00:00.000Z',
      durationMinutes: 30,
    }));

    const redisAfterScenario3 = await redis.get(disconnectedRedisKey);
    output.scenario3 = {
      httpStatus: scenario3Response.status,
      response: scenario3Response.body,
      redisKeyDeletedBecauseStale: redisAfterScenario3 === null,
      passed:
        scenario3Response.status === 200 &&
        scenario3Response.body?.result?.success === false &&
        scenario3Response.body?.result?.code === 'GOOGLE_CALENDAR_RECONNECT_REQUIRED',
    };

    await restoreBusiness(originalDisconnected);
    await redis.del(disconnectedRedisKey);
    output.cleanup.push('scenario3 cleaned');
  } catch (e) {
    output.error = e?.stack || e?.message || String(e);
  } finally {
    try { await restoreBusiness(originalSuccess); } catch {}
    try { await restoreBusiness(originalInvalid); } catch {}
    try { await restoreBusiness(originalDisconnected); } catch {}
    try { await redis.del(`vapi_config:${BUSINESS_SUCCESS.assistantId}`); } catch {}
    try { await redis.del(`vapi_config:${BUSINESS_INVALID.assistantId}`); } catch {}
    try { await redis.del(`vapi_config:${BUSINESS_DISCONNECTED.assistantId}`); } catch {}
    await redis.quit();
    await prisma.$disconnect();
  }

  fs.writeFileSync('/app/scripts/e2e_book_appointment_after_fix.out.json', JSON.stringify(output, null, 2));
  console.log('WROTE:/app/scripts/e2e_book_appointment_after_fix.out.json');
  console.log(JSON.stringify(output, null, 2));
})();
