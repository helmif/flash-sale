import type { SaleDefinition, SalePhase } from './flash-sale.types';

/** Where `now` falls in the sale window. Start is inclusive, end is exclusive. */
export const getPhase = (sale: SaleDefinition, now: number): SalePhase => {
    if (now < sale.startsAt) return 'upcoming';
    if (now >= sale.endsAt) return 'ended';
    return 'active';
};
