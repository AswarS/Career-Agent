import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('teams')
export class TeamEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', default: 'ecommerce-mvp' })
  domain!: string;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ type: 'text', default: 'active' })
  status!: string;

  @Column({ type: 'json', nullable: true })
  members?: TeamMember[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  config?: Record<string, unknown>;
}
