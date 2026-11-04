import { Test, TestingModule } from '@nestjs/testing';
import { PeriodoController } from './periodo.controller';

describe('PeriodoController', () => {
  let controller: PeriodoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeriodoController],
    }).compile();

    controller = module.get<PeriodoController>(PeriodoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
