import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('api_settings')
export class ApiSettingsEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', unique: true })
  userId!: number;

  @Column({ type: 'text', nullable: true })
  apiKey?: string;

  @Column({ type: 'text', nullable: true })
  baseUrl?: string;

  @Column({ type: 'text', nullable: true })
  model?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
