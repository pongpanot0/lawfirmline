import { SubscriptionService } from './subscription.service';

describe('Omise webhook', () => {
  const invoice = { id: 'inv-1', firmId: 'firm-a', plan: 'FIRM', amount: 2999, status: 'PENDING', omiseChargeId: 'chrg_real' };
  const make = (charge: any, found: any = invoice) => {
    const prisma = { billingInvoice: { findFirst: jest.fn().mockResolvedValue(found) } } as any;
    const omise = { getCharge: jest.fn().mockResolvedValue(charge) } as any;
    const svc = new SubscriptionService(prisma, {} as any, omise, {} as any);
    const activate = jest.spyOn(svc, 'activateSubscription').mockResolvedValue(undefined as any);
    return { svc, prisma, omise, activate };
  };

  it('a forged "paid" body does nothing while Omise says the charge is unpaid', async () => {
    const { svc, omise, activate } = make({ id: 'chrg_real', paid: false, status: 'pending' });
    await svc.handleWebhook({ key: 'charge.complete', data: { id: 'chrg_real', paid: true, metadata: { invoiceId: 'inv-1', firmId: 'firm-b', plan: 'PROFESSIONAL' } } });
    expect(omise.getCharge).toHaveBeenCalledWith('chrg_real');
    expect(activate).not.toHaveBeenCalled();
  });

  it('activates from our invoice, ignoring posted metadata', async () => {
    const { svc, activate } = make({ id: 'chrg_real', paid: true });
    await svc.handleWebhook({ key: 'charge.complete', data: { id: 'chrg_real', metadata: { firmId: 'firm-b', plan: 'PROFESSIONAL' } } });
    expect(activate).toHaveBeenCalledWith('firm-a', 'FIRM', 'inv-1', 'chrg_real', 2999);
  });

  it('an unknown charge never reaches Omise or activation', async () => {
    const { svc, omise, activate } = make({ id: 'chrg_x', paid: true }, null);
    await svc.handleWebhook({ data: { id: 'chrg_x' } });
    expect(omise.getCharge).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it('ignores malformed charge ids', async () => {
    const { svc, prisma } = make({ id: 'x', paid: true });
    await svc.handleWebhook({ data: { id: '../../charges' } });
    expect(prisma.billingInvoice.findFirst).not.toHaveBeenCalled();
  });
});
