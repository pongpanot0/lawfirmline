/** Let existing service mocks execute the callback used for atomic history. */
export function mockTaskHistoryTransaction(prisma: any) {
  prisma.auditLog = { create: jest.fn() };
  prisma.$transaction = jest.fn(async (callback) => callback({
    ...prisma,
    task: {
      ...prisma.task,
      findUniqueOrThrow: async ({ where }: any) => await prisma.task.findUnique({ where }) ?? { id: where.id },
      update: async (args: any) => await prisma.task.update(args) ?? { id: args.where.id, ...args.data },
    },
  }));
}
