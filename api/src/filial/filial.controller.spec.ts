import { Test, TestingModule } from '@nestjs/testing';
import { FilialController } from './filial.controller';

describe('FilialController', () => {
  let controller: FilialController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilialController],
    }).compile();

    controller = module.get<FilialController>(FilialController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
