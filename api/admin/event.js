const { requireAdmin, sendError, supabaseRequest } = require('../_supabase');

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    if (request.method === 'GET') {
      const settings = await supabaseRequest(
        'site_settings?key=in.(challenges_locked,event_start,event_end)&select=key,value'
      );
      const values = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
      return response.status(200).json({
        locked: values.challenges_locked !== 'false',
        start: values.event_start || '',
        end: values.event_end || ''
      });
    }

    if (request.method === 'PATCH') {
      const locked = request.body?.locked === true;
      const hasSchedule = typeof request.body?.start === 'string' || typeof request.body?.end === 'string';
      const start = typeof request.body?.start === 'string' ? request.body.start.trim() : '';
      const end = typeof request.body?.end === 'string' ? request.body.end.trim() : '';
      if (hasSchedule && (start || end)) {
        const startTime = start ? new Date(start) : null;
        const endTime = end ? new Date(end) : null;
        if ((startTime && Number.isNaN(startTime.getTime())) || (endTime && Number.isNaN(endTime.getTime()))) {
          return response.status(400).json({ error: 'Invalid challenge schedule date or time' });
        }
        if (startTime && endTime && endTime <= startTime) {
          return response.status(400).json({ error: 'End time must be after start time' });
        }
      }
      const updates = [{ key: 'challenges_locked', value: String(locked) }];
      if (hasSchedule) {
        updates.push(
          { key: 'event_start', value: start },
          { key: 'event_end', value: end }
        );
      }
      await supabaseRequest('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(updates)
      });
      return response.status(200).json({ locked, start, end });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return sendError(response, error);
  }
};
