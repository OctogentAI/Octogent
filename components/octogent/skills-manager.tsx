'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit2, Trash2, Zap, Code, Search, FileText, Server } from 'lucide-react';
import type { Skill } from '@/lib/types';

interface SkillsManagerProps {
  skills: Skill[];
  onSave: (skill: Skill) => void;
  onDelete: (name: string) => void;
}

const skillIcons: Record<string, React.ElementType> = {
  Coder: Code,
  Researcher: Search,
  Writer: FileText,
  DevOps: Server,
  default: Zap
};

export function SkillsManager({ skills, onSave, onDelete }: SkillsManagerProps) {
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleNewSkill = () => {
    setEditingSkill({
      name: '',
      description: '',
      system_prompt: '',
      tools: [],
      examples: [],
      trigger_patterns: []
    });
    setIsDialogOpen(true);
  };

  const handleEditSkill = (skill: Skill) => {
    setEditingSkill({ ...skill });
    setIsDialogOpen(true);
  };

  const handleSaveSkill = () => {
    if (editingSkill && editingSkill.name && editingSkill.description && editingSkill.system_prompt) {
      onSave(editingSkill);
      setIsDialogOpen(false);
      setEditingSkill(null);
    }
  };

  const handleDeleteSkill = (name: string) => {
    if (confirm(`Are you sure you want to delete the "${name}" skill?`)) {
      onDelete(name);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Skills</h2>
          <p className="text-muted-foreground">Manage agent skills and behaviors</p>
        </div>
        <Button onClick={handleNewSkill}>
          <Plus className="w-4 h-4 mr-2" />
          New Skill
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => {
          const Icon = skillIcons[skill.name] || skillIcons.default;
          return (
            <Card key={skill.name} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{skill.name}</CardTitle>
                      <CardDescription className="line-clamp-1">{skill.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditSkill(skill)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDeleteSkill(skill.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tools</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {skill.tools?.slice(0, 5).map((tool) => (
                        <Badge key={tool} variant="secondary" className="text-xs">
                          {tool}
                        </Badge>
                      ))}
                      {skill.tools && skill.tools.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{skill.tools.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  {skill.trigger_patterns && skill.trigger_patterns.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Triggers</Label>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {skill.trigger_patterns.slice(0, 3).join(', ')}
                        {skill.trigger_patterns.length > 3 && '...'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingSkill?.name ? 'Edit Skill' : 'Create New Skill'}</DialogTitle>
            <DialogDescription>
              Define a skill with a system prompt and available tools
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="skill-name">Name</Label>
                  <Input
                    id="skill-name"
                    value={editingSkill?.name || ''}
                    onChange={(e) => setEditingSkill(prev => prev ? { ...prev, name: e.target.value } : null)}
                    placeholder="e.g., Coder"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skill-description">Description</Label>
                  <Input
                    id="skill-description"
                    value={editingSkill?.description || ''}
                    onChange={(e) => setEditingSkill(prev => prev ? { ...prev, description: e.target.value } : null)}
                    placeholder="e.g., Expert software developer"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skill-prompt">System Prompt</Label>
                <Textarea
                  id="skill-prompt"
                  value={editingSkill?.system_prompt || ''}
                  onChange={(e) => setEditingSkill(prev => prev ? { ...prev, system_prompt: e.target.value } : null)}
                  placeholder="Define the agent's behavior and guidelines..."
                  className="min-h-[150px] font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Tools</Label>
                <div className="flex flex-wrap gap-2">
                  {['bash', 'read_file', 'write_file', 'list_dir', 'web_search', 'web_fetch', 'memory_save', 'memory_read', 'spawn_agent', 'check_task'].map(tool => (
                    <Button
                      key={tool}
                      variant={editingSkill?.tools?.includes(tool) ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (!editingSkill) return;
                        const tools = editingSkill.tools || [];
                        const newTools = tools.includes(tool)
                          ? tools.filter(t => t !== tool)
                          : [...tools, tool];
                        setEditingSkill({ ...editingSkill, tools: newTools });
                      }}
                    >
                      {tool}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skill-triggers">Trigger Patterns (one per line)</Label>
                <Textarea
                  id="skill-triggers"
                  value={editingSkill?.trigger_patterns?.join('\n') || ''}
                  onChange={(e) => setEditingSkill(prev => prev ? { ...prev, trigger_patterns: e.target.value.split('\n').filter(Boolean) } : null)}
                  placeholder="write.*code&#10;create.*script&#10;implement.*function"
                  className="min-h-[80px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Regex patterns that trigger this skill</p>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSkill} disabled={!editingSkill?.name || !editingSkill?.description || !editingSkill?.system_prompt}>
              Save Skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
