import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import kidsSetup from "@/content/help/articles/kids-setup.md?raw";

export default function KidsSetupGuide() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <Badge variant="outline">Setup guide</Badge>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/help/kids-setup">
              Open in Help Center <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{kidsSetup}</ReactMarkdown>
        </article>
      </CardContent>
    </Card>
  );
}
