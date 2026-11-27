// =============================================================================
// HTTP & SSE trasy pre nahrávanie pohovorov a prezenčnú synchronizáciu
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

function decodeRoomParam(pathname, suffix) {
  const rawRoom = pathname.split('/api/meetings/')[1].slice(0, -suffix.length);
  return decodeURIComponent(rawRoom).trim();
}

function isStaffUser(user) {
  return !!(user && (user.ures_tag === 'SUPERADMIN' || user.ures_tag === 'HR_ADMIN'));
}

async function handleRecordingRoutes({
  req,
  res,
  pathname,
  url,
  getAuthUser,
  sendJson,
  parseJsonBody,
  parseRawBody,
  recordingManager,
}) {
  // GET /api/meetings/:roomId/recording/events - SSE stream stavu nahrávania
  if (pathname.match(/^\/api\/meetings\/[^/]+\/recording\/events$/) && req.method === 'GET') {
    const roomId = decodeRoomParam(pathname, '/recording/events');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    recordingManager.addSseClient(roomId, res);
    res.write(`data: ${JSON.stringify(recordingManager.getStatus(roomId))}\n\n`);
    req.on('close', () => recordingManager.removeSseClient(roomId, res));
    return true;
  }

  // GET /api/meetings/:roomId/recording/status
  if (pathname.match(/^\/api\/meetings\/[^/]+\/recording\/status$/) && req.method === 'GET') {
    const roomId = decodeRoomParam(pathname, '/recording/status');
    sendJson(res, 200, recordingManager.getStatus(roomId));
    return true;
  }

  // POST /api/meetings/:roomId/presence - Heartbeat pripojenia účastníka
  if (pathname.match(/^\/api\/meetings\/[^/]+\/presence$/) && req.method === 'POST') {
    const roomId = decodeRoomParam(pathname, '/presence');
    const authUser = getAuthUser(req);
    const body = await parseJsonBody(req);
    const result = recordingManager.registerPresence(roomId, {
      clientId: body.clientId,
      authUser,
      name: body.name,
      email: body.email,
      inviteeEmail: body.inviteeEmail,
      autoJoin: !!body.autoJoin,
    });
    sendJson(res, 200, result);
    return true;
  }

  // POST /api/meetings/:roomId/presence/leave - Odchod účastníka
  if (pathname.match(/^\/api\/meetings\/[^/]+\/presence\/leave$/) && req.method === 'POST') {
    const roomId = decodeRoomParam(pathname, '/presence/leave');
    const body = await parseJsonBody(req);
    sendJson(res, 200, recordingManager.unregisterPresence(roomId, body.clientId));
    return true;
  }

  // POST /api/meetings/:roomId/recording/control - Zapnúť/pozastaviť/vypnúť (len HR/Superadmin)
  if (pathname.match(/^\/api\/meetings\/[^/]+\/recording\/control$/) && req.method === 'POST') {
    const roomId = decodeRoomParam(pathname, '/recording/control');
    const authUser = getAuthUser(req);
    const body = await parseJsonBody(req);
    try {
      const result = recordingManager.controlRecording(roomId, {
        authUser,
        action: body.action,
      });
      sendJson(res, 200, result);
    } catch (ctrlErr) {
      sendJson(res, ctrlErr.statusCode || 400, { error: ctrlErr.message });
    }
    return true;
  }

  // POST /api/meetings/:roomId/recording/chunk - Uloženie bloku videa/zvuku do server/recording/
  if (pathname.match(/^\/api\/meetings\/[^/]+\/recording\/chunk$/) && req.method === 'POST') {
    const roomId = decodeRoomParam(pathname, '/recording/chunk');
    const buffer = await parseRawBody(req);
    const result = recordingManager.appendChunk(roomId, {
      sessionId: url.searchParams.get('sessionId') || '',
      clientId: url.searchParams.get('clientId') || '',
      roleTag: url.searchParams.get('role') || 'ucastnik',
      name: url.searchParams.get('name') || 'ucastnik',
      email: url.searchParams.get('email') || '',
      mimeType: url.searchParams.get('mimeType') || req.headers['content-type'] || 'video/webm',
      isFinal: url.searchParams.get('final') === '1',
    }, buffer);
    sendJson(res, 200, result);
    return true;
  }

  // GET /api/meetings/:roomId/recordings - Zoznam nahrávok (len HR/Superadmin)
  if (pathname.match(/^\/api\/meetings\/[^/]+\/recordings$/) && req.method === 'GET') {
    const authUser = getAuthUser(req);
    if (!isStaffUser(authUser)) {
      sendJson(res, 403, { error: 'Prístup k nahrávkam je povolený len pre HR alebo Superadmina.' });
      return true;
    }
    const roomId = decodeRoomParam(pathname, '/recordings');
    sendJson(res, 200, {
      roomId,
      files: recordingManager.listRoomRecordings(roomId),
    });
    return true;
  }

  return false;
}

module.exports = {
  handleRecordingRoutes,
};
