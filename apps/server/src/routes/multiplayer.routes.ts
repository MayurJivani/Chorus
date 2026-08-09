import { Router } from 'express';
import { z } from 'zod';
import { createRoom } from '../services/multiplayerService';
import { getArtistById } from '../services/deezerService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';

export const multiplayerRouter = Router();

const createRoomSchema = z.object({
  artistId: z.coerce.number().int().positive(),
  // Chosen when the room is made, not per player: everyone in a race has to be answering the
  // same way for the scores to mean anything.
  guessMode: z.enum(['search', 'choice']).optional().default('search'),
});

/**
 * Creates an empty multiplayer room for an artist. The creator then connects over the
 * WebSocket (/ws) and becomes host on their first `join_room`. Kept as a tiny REST call so
 * the browser can get the room code (for the shareable link) before the socket connects.
 */
multiplayerRouter.post(
  '/rooms',
  validate(createRoomSchema),
  asyncHandler(async (req, res) => {
    const { artistId, guessMode } = req.body as z.infer<typeof createRoomSchema>;
    const artist = await getArtistById(artistId);
    if (!artist) throw new HttpError(404, 'Artist not found');
    const { code } = createRoom(artistId, artist.name, artist.pictureUrl, guessMode);
    res.status(201).json({
      code,
      artistId,
      artistName: artist.name,
      artistPictureUrl: artist.pictureUrl,
      guessMode,
    });
  }),
);
