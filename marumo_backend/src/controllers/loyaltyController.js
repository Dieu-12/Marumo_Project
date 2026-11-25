import { createLoyaltyService } from '../services/loyaltyService.js';

export function createLoyaltyController(repository) {
  const service = createLoyaltyService(repository);
  return {
    async getAccount(req, res) {
      const loyalty = await service.getLoyaltyAccount(req.session.userId);
      res.status(200).json(loyalty);
    },
  };
}
