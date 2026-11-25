export function createLoyaltyService(repository) {
  return {
    async getLoyaltyAccount(userId) {
      return repository.getLoyaltyAccount({ userId });
    },
  };
}
