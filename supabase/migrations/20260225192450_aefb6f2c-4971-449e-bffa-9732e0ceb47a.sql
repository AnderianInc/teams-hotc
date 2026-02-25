-- Allow admins to delete children
CREATE POLICY "Admins can delete children"
ON public.children
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete families
CREATE POLICY "Admins can delete families"
ON public.families
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));