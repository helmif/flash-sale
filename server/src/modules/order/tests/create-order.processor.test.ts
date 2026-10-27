import { UnrecoverableError } from 'bullmq';
import { createOrderProcessor } from '../processors/create-order.processor';

const job = { data: { orderId: 'order-1', userId: 'alice', saleId: 'launch', reservedAt: 1_000 } };

const setup = (saveOutcome: 'created' | 'exists' | 'conflict') => {
    const orderRepository = { save: jest.fn().mockResolvedValue(saveOutcome) };
    const statusWriter = { markConfirmed: jest.fn().mockResolvedValue(undefined) };
    const process = createOrderProcessor({ orderRepository, statusWriter, now: () => 2_000 });
    return { process, orderRepository, statusWriter };
};

describe('order processor', () => {
    it('saves the order, then marks it confirmed', async () => {
        const { process, orderRepository, statusWriter } = setup('created');

        await process(job);

        expect(orderRepository.save).toHaveBeenCalledWith(job.data);
        expect(statusWriter.markConfirmed).toHaveBeenCalledWith('order-1', 2_000);
    });

    it('treats a retried job whose order is already saved as success', async () => {
        const { process, statusWriter } = setup('exists');
        await process(job);
        expect(statusWriter.markConfirmed).toHaveBeenCalledWith('order-1', 2_000);
    });

    it('stops without retrying when MongoDB rejects a second order for the same user', async () => {
        const { process, statusWriter } = setup('conflict');
        await expect(process(job)).rejects.toBeInstanceOf(UnrecoverableError);
        expect(statusWriter.markConfirmed).not.toHaveBeenCalled();
    });

    it('lets a transient failure propagate so BullMQ retries the job', async () => {
        const { process, orderRepository } = setup('created');
        orderRepository.save.mockRejectedValue(new Error('mongo timeout'));
        await expect(process(job)).rejects.toThrow('mongo timeout');
    });
});
