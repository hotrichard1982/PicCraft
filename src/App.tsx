import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from "@/components/Header"
import { SingleTab } from "@/components/SingleTab"
import { BatchTab } from "@/components/BatchTab"
import { AboutTab } from "@/components/AboutTab"

function App() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />

      <Tabs defaultValue="single" className="flex-1 flex flex-col min-h-0">
        <div className="flex justify-center border-b px-4">
          <TabsList className="h-10 -mb-[1px]">
            <TabsTrigger value="single" className="px-6">单张处理</TabsTrigger>
            <TabsTrigger value="batch" className="px-6">批量处理</TabsTrigger>
            <TabsTrigger value="about" className="px-6">关于我们</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="single" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
          <SingleTab />
        </TabsContent>
        <TabsContent value="batch" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
          <BatchTab />
        </TabsContent>
        <TabsContent value="about" className="flex-1 min-h-0 m-0 overflow-auto data-[state=inactive]:hidden">
          <AboutTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default App
