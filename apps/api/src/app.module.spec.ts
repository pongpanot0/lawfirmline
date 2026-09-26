import 'reflect-metadata';
import { readdirSync } from 'fs';
import { join, relative } from 'path';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('resolves every provider without a dependency cycle', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AppModule)).toBeDefined();
    await moduleRef.close();
  });

  // Circular imports bake `undefined` into @Module({ imports }) or constructor
  // param types when the "wrong" file happens to load first. Load each module
  // file first in a fresh registry and check the whole graph for holes.
  const moduleFiles = (function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === 'generated' ? [] : walk(join(dir, e.name))) : e.name.endsWith('.module.ts') ? [join(dir, e.name)] : [],
    );
  })(__dirname);

  it.each(moduleFiles.map((f) => relative(__dirname, f)))('has no undefined imports when %s loads first', (file) => {
    const holes: string[] = [];
    jest.isolateModules(() => {
      require(join(__dirname, file));
      const { AppModule: Root } = require('./app.module');
      const seen = new Set<unknown>();
      const checkParams = (owner: string, cls: any) => {
        const types: unknown[] = Reflect.getMetadata('design:paramtypes', cls) ?? [];
        const overridden = new Set((Reflect.getMetadata('self:paramtypes', cls) ?? []).map((p: { index: number }) => p.index));
        types.forEach((t, i) => t === undefined && !overridden.has(i) && holes.push(`${owner} -> ${cls.name} param[${i}]`));
      };
      const visit = (mod: any) => {
        if (seen.has(mod)) return;
        seen.add(mod);
        const imports: any[] = [...(Reflect.getMetadata('imports', mod) ?? []), ...(mod.imports ?? [])];
        imports.forEach((imp, i) => {
          if (imp === undefined) return holes.push(`${mod.name ?? mod.module?.name} imports[${i}]`);
          const target = imp.forwardRef ? imp.forwardRef() : imp;
          visit(target.module ?? target);
        });
        const cls = mod.module ?? mod;
        for (const key of ['providers', 'controllers']) {
          for (const p of Reflect.getMetadata(key, cls) ?? []) if (typeof p === 'function') checkParams(cls.name, p);
        }
      };
      visit(Root);
    });
    expect(holes).toEqual([]);
  });
});
