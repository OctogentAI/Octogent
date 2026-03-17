'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, RotateCcw } from 'lucide-react';
import type { SystemConfig } from '@/lib/types';

interface ConfigEditorProps {
  config: SystemConfig | null;
  onSave: (config: Partial<SystemConfig>) => void;
}

export function ConfigEditor({ config, onSave }: ConfigEditorProps) {
  const [localConfig, setLocalConfig] = useState<SystemConfig | null>(config);
  const [hasChanges, setHasChanges] = useState(false);

  if (!localConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  const handleChange = <K extends keyof SystemConfig>(
    section: K,
    key: keyof SystemConfig[K],
    value: unknown
  ) => {
    setLocalConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [key]: value
        }
      };
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (localConfig) {
      onSave(localConfig);
      setHasChanges(false);
    }
  };

  const handleReset = () => {
    setLocalConfig(config);
    setHasChanges(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configuration</h2>
          <p className="text-muted-foreground">Manage Octogent system settings</p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          )}
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="gateway">Gateway</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LLM Configuration</CardTitle>
              <CardDescription>Configure the language models used by agents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="primary">Primary Model</Label>
                  <Input
                    id="primary"
                    value={localConfig.models.primary}
                    onChange={(e) => handleChange('models', 'primary', e.target.value)}
                    placeholder="ollama/llama3:8b"
                  />
                  <p className="text-xs text-muted-foreground">Format: provider/model</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ollama_host">Ollama Host</Label>
                  <Input
                    id="ollama_host"
                    value={localConfig.models.ollama_host}
                    onChange={(e) => handleChange('models', 'ollama_host', e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localConfig.models.temperature}
                    onChange={(e) => handleChange('models', 'temperature', parseFloat(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_tokens">Max Tokens</Label>
                  <Input
                    id="max_tokens"
                    type="number"
                    min="1"
                    value={localConfig.models.max_tokens}
                    onChange={(e) => handleChange('models', 'max_tokens', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Worker Pool Configuration</CardTitle>
              <CardDescription>Configure the parallel execution settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max_slots">Max Worker Slots</Label>
                  <Input
                    id="max_slots"
                    type="number"
                    min="1"
                    max="32"
                    value={localConfig.workers.max_slots}
                    onChange={(e) => handleChange('workers', 'max_slots', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_iterations">Max Iterations</Label>
                  <Input
                    id="max_iterations"
                    type="number"
                    min="1"
                    value={localConfig.workers.max_iterations}
                    onChange={(e) => handleChange('workers', 'max_iterations', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="context_limit">Context Limit</Label>
                  <Input
                    id="context_limit"
                    type="number"
                    min="1000"
                    value={localConfig.workers.context_limit}
                    onChange={(e) => handleChange('workers', 'context_limit', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prune_threshold">Prune Threshold</Label>
                  <Input
                    id="prune_threshold"
                    type="number"
                    min="1000"
                    value={localConfig.workers.prune_threshold}
                    onChange={(e) => handleChange('workers', 'prune_threshold', parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Thinking Mode</Label>
                  <p className="text-xs text-muted-foreground">Show agent reasoning process</p>
                </div>
                <Switch
                  checked={localConfig.workers.thinking_mode}
                  onCheckedChange={(checked) => handleChange('workers', 'thinking_mode', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateway" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gateway Configuration</CardTitle>
              <CardDescription>Configure the WebSocket and REST API server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    min="1"
                    max="65535"
                    value={localConfig.gateway.port}
                    onChange={(e) => handleChange('gateway', 'port', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    value={localConfig.gateway.host}
                    onChange={(e) => handleChange('gateway', 'host', e.target.value)}
                    placeholder="127.0.0.1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>CORS Origins</Label>
                <Input
                  value={localConfig.gateway.cors_origins?.join(', ') || ''}
                  onChange={(e) => handleChange('gateway', 'cors_origins', e.target.value.split(',').map(s => s.trim()))}
                  placeholder="http://localhost:3000, https://example.com"
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of allowed origins</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tools Configuration</CardTitle>
              <CardDescription>Configure the available agent tools</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Enabled Tools</Label>
                <div className="flex flex-wrap gap-2">
                  {['bash', 'read_file', 'write_file', 'list_dir', 'web_search', 'web_fetch', 'memory_save', 'memory_read', 'spawn_agent', 'check_task'].map(tool => (
                    <Button
                      key={tool}
                      variant={localConfig.tools.enabled?.includes(tool) ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const enabled = localConfig.tools.enabled || [];
                        const newEnabled = enabled.includes(tool)
                          ? enabled.filter(t => t !== tool)
                          : [...enabled, tool];
                        handleChange('tools', 'enabled', newEnabled);
                      }}
                    >
                      {tool}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bash_timeout">Bash Timeout (ms)</Label>
                  <Input
                    id="bash_timeout"
                    type="number"
                    min="1000"
                    value={localConfig.tools.bash_timeout}
                    onChange={(e) => handleChange('tools', 'bash_timeout', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_file_size">Max File Size (bytes)</Label>
                  <Input
                    id="max_file_size"
                    type="number"
                    min="1024"
                    value={localConfig.tools.max_file_size}
                    onChange={(e) => handleChange('tools', 'max_file_size', parseInt(e.target.value))}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="searxng_url">SearXNG URL</Label>
                  <Input
                    id="searxng_url"
                    value={localConfig.tools.searxng_url}
                    onChange={(e) => handleChange('tools', 'searxng_url', e.target.value)}
                    placeholder="http://localhost:8080"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
