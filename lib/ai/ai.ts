// src/lib/ai-helper.ts
import { getSnippets, recordError, getCurrentContext, updateDeveloperContext,saveSnippet } from '../storage/code-storage';
import {OpenAI} from 'openai';
import { CodeSnippet,getErrorSolutions } from '../storage/code-storage';

interface AIConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
}

export class AIHelper {
  private openai: OpenAI;
  private model: string;
  private temperature: number;

  constructor(config: AIConfig) {
   
    this.openai = new OpenAI({
        apiKey: config.apiKey,
      });
    this.model = config.model || 'gpt-4-turbo';
    this.temperature = config.temperature || 0.7;
  }

  // Main method to process OCR content
  async processCodeContent(content: string, context: {
    filePath?: string;
    language?: string;
    sourceApp: string;
  }): Promise<{
    suggestions: string[];
    errors?: { error: string; solution: string }[];
    snippets?: CodeSnippet[];
  }> {
    // Update developer context first
    await updateDeveloperContext({
      currentApp: context.sourceApp,
      activeFile: context.filePath,
      lastActivity: new Date().toISOString()
    });

    // Analyze the content with different checks in parallel
    const [errorAnalysis, suggestionAnalysis, snippetMatch] = await Promise.all([
      this.detectErrors(content, context.language),
      this.generateSuggestions(content, context),
      this.findRelevantSnippets(content, context.language)
    ]);

    return {
      suggestions: suggestionAnalysis,
      errors: errorAnalysis,
      snippets: snippetMatch
    };
  }

  // Error detection and solution
  private async detectErrors(
    code: string,
    language?: string
  ): Promise<{ error: string; solution: string }[] | undefined> {
    const errorPatterns = [
      // Common error patterns
      /error\s*:\s*(.*)/i,
      /(SyntaxError|TypeError|ReferenceError):\s*(.*)/,
      /(E\d+):\s*(.*)/,
      /(exception|unhandled)\s*(.*)/i
    ];

    const foundErrors: { error: string; solution: string }[] = [];

    for (const pattern of errorPatterns) {
      const match = code.match(pattern);
      if (match) {
        const errorText = match[0];
        // First check our database for known solutions
        const dbSolutions = language ? await getErrorSolutions(errorText, language) : [];
        
        if (dbSolutions.length > 0) {
          dbSolutions.forEach(sol => {
            foundErrors.push({
              error: errorText,
              solution: sol.solution
            });
          });
        } else {
          // If no DB solution, ask AI
          const aiSolution = await this.generateErrorSolution(errorText, language);
          if (aiSolution) {
            foundErrors.push({
              error: errorText,
              solution: aiSolution
            });
            // Save to DB for future reference
            if (language) {
              await recordError({
                errorText,
                solution: aiSolution,
                language
              });
            }
          }
        }
      }
    }

    return foundErrors.length > 0 ? foundErrors : undefined;
  }

  private async generateErrorSolution(
    error: string,
    language?: string
  ): Promise<string | undefined> {
    try {
      const prompt = `Provide a concise solution for this ${language || 'programming'} error:
      Error: ${error}
      
      Solution:`;
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert programming assistant. Provide clear, concise solutions to errors.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.temperature,
        max_tokens: 200
      });

      return response.choices[0]?.message?.content?.trim() || undefined;
    } catch (error) {
      console.error('Error generating solution:', error);
      return undefined;
    }
  }

  // Code suggestions
  private async generateSuggestions(
    code: string,
    context: { filePath?: string; language?: string }
  ): Promise<string[]> {
    try {
      const currentContext = await getCurrentContext();
      const snippets = await getSnippets({ language: context.language, limit: 3 });

      const prompt = `Based on this code context:
      File: ${context.filePath || 'unknown'}
      Language: ${context.language || 'unknown'}
      Current code:
      ${code}
      
      ${snippets.length > 0 ? `Relevant snippets:\n${snippets.map(s => s.content).join('\n---\n')}` : ''}
      
      Provide 3 concise suggestions to improve or continue this code. Format as bullet points.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a pair programming assistant. Provide helpful, concise coding suggestions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.temperature,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      // Parse bullet points from response
      return content
        .split('\n')
        .filter(line => line.startsWith('-') || line.startsWith('•'))
        .map(line => line.replace(/^[-•]\s*/, '').trim())
        .slice(0, 3);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return [];
    }
  }

  // Snippet matching
  private async findRelevantSnippets(
    code: string,
    language?: string
  ): Promise<CodeSnippet[] | undefined> {
    if (!code.trim()) return undefined;

    try {
      // First try to find exact matches
      const exactMatches = await getSnippets({
        language,
        searchTerm: code.trim().slice(0, 50),
        limit: 2
      });

      if (exactMatches.length > 0) {
        return exactMatches;
      }

      // If no exact matches, try semantic search
      const embedding = await this.generateEmbedding(code);
      // Note: SQLite doesn't natively support vector search
      // For production, consider a vector DB or extension
      // This is a simplified approach:
      const allSnippets = await getSnippets({ language });
      
      // Simple similarity comparison (for demo purposes)
      const scoredSnippets = await Promise.all(
        allSnippets.map(async snippet => ({
          snippet,
          score: await this.calculateSimilarity(embedding, snippet.content)
        }))
      );

      return scoredSnippets
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(item => item.snippet);
    } catch (error) {
      console.error('Error finding snippets:', error);
      return undefined;
    }
  }

  // Helper methods
  private async generateEmbedding(text: string): Promise<number[]> {
    // In a real implementation, you would call OpenAI's embedding API
    // This is a simplified mock version
    return [];
  }

  private async calculateSimilarity(embedding: number[], text: string): Promise<number> {
    // In a real implementation, you would compare embeddings
    // This is a simplified mock version
    return Math.random();
  }

  // Manual snippet saving with AI enhancement
  async createEnhancedSnippet(
    code: string,
    context: { language?: string; filePath?: string; sourceApp: string }
  ): Promise<CodeSnippet> {
    // Generate automatic tags and description using AI
    const enhanced = await this.enhanceSnippetMetadata(code, context.language);

    return await saveSnippet({
      content: code,
      language: context.language || enhanced.language || 'unknown',
      tags: enhanced.tags,
      filePath: context.filePath,
      projectContext: await this.getProjectContext(context.filePath),
      sourceApp: context.sourceApp
    });
  }

  private async enhanceSnippetMetadata(
    code: string,
    language?: string
  ): Promise<{ tags: string[]; language?: string }> {
    try {
      const prompt = `Analyze this code snippet:
      ${code}
      
      Provide:
      1. The programming language (if not specified)
      2. 3-5 tags that describe its functionality
      
      Format as JSON: { language?: string, tags: string[] }`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a code analysis assistant. Provide accurate metadata about code snippets.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temp for more consistent results
        max_tokens: 200
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return { tags: [] };

      try {
        return JSON.parse(content) as { tags: string[]; language?: string };
      } catch {
        return { tags: [] };
      }
    } catch (error) {
      console.error('Error enhancing snippet:', error);
      return { tags: [] };
    }
  }

  private async getProjectContext(filePath?: string): Promise<string | undefined> {
    if (!filePath) return undefined;
    // Extract project root from file path
    // This is a simplified version - you might want to detect
    // package.json, .git, or other project markers
    const parts = filePath.split(/[\\/]/);
    return parts.length > 1 ? parts[parts.length - 2] : undefined;
  }
}